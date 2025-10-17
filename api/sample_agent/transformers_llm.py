"""Transformers LLM implementation for Google ADK."""

from __future__ import annotations

import asyncio
import json
import logging
import requests
from typing import AsyncGenerator, Optional, Any, Dict, List
from functools import cached_property

import openai
from google.genai import types
from typing_extensions import override

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse

logger = logging.getLogger("google_adk." + __name__)


class TransformersLlm(BaseLlm):
    """Transformers integration for Hugging Face models.

    This implementation provides Transformers API integration for Google ADK,
    supporting both streaming and non-streaming responses, tool calling,
    and multimodal content through OpenAI-compatible endpoints.

    Attributes:
        model: The name of the Transformers model (e.g., 'meta-llama/Llama-3.2-1B-Instruct').
        api_key: API key for the Transformers endpoint (optional).
        base_url: Custom base URL for Transformers API (optional, defaults to localhost).
        organization: Organization ID (optional).
        max_retries: Maximum number of retries for API calls (default: 3).
        timeout: Request timeout in seconds (default: 60).
    """

    api_key: Optional[str] = None
    base_url: Optional[str] = None
    organization: Optional[str] = None
    max_retries: int = 3
    timeout: float = 60.0

    @classmethod
    @override
    def supported_models(cls) -> list[str]:
        """Returns regex patterns for supported Transformers models."""
        return [
            r"deepseek-ai/.*",
            r"meta-llama/.*",
            r"mistralai/.*",
            r"unsloth/.*",
            r".*"  # Support any model when using custom endpoints
        ]

    @cached_property
    def _transformers_client(self) -> openai.AsyncOpenAI:
        """Creates and caches the Transformers async client."""
        kwargs = {
            "max_retries": self.max_retries,
            "timeout": self.timeout,
        }

        if self.api_key:
            kwargs["api_key"] = self.api_key

        if self.base_url:
            kwargs["base_url"] = self.base_url

        if self.organization:
            kwargs["organization"] = self.organization

        return openai.AsyncOpenAI(**kwargs)

    @override
    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        """Generates content asynchronously using Transformers API.

        Args:
            llm_request: The request containing messages, tools, and config.
            stream: Whether to stream the response.

        Yields:
            LlmResponse objects containing the model's response.
        """
        # Ensure there's user content for the model to respond to
        self._maybe_append_user_content(llm_request)

        logger.debug(f"Transformers request for model: {self.model}")

        try:
            # Convert ADK request to Transformers API format
            messages = self._convert_contents_to_messages(llm_request.contents)

            # Add system instruction if present
            if llm_request.config.system_instruction:
                messages.insert(0, {
                    "role": "system",
                    "content": llm_request.config.system_instruction
                })

            # Convert tools if present
            tools = self._convert_tools(llm_request)

            # Prepare Transformers API parameters
            api_params = {
                "model": self.model,
                "messages": messages,
                "stream": stream,
            }

            # Add tools only if the query seems to require them AND no function responses are present
            if tools:
                # Check if there are function responses in the conversation
                has_function_responses = any(
                    msg.get("role") == "tool" for msg in messages
                )

                if has_function_responses:
                    logger.debug("Function responses present - not including tools to allow natural language response")
                else:
                    last_message = messages[-1] if messages else {}
                    content = last_message.get("content", "").lower()

                    # Only include tools for queries that seem to need them
                    if any(keyword in content for keyword in ["weather", "time", "temperature", "forecast", "clock"]):
                        logger.debug(f"Adding {len(tools)} tools to request for function-related query")
                        api_params["tools"] = tools
                        api_params["tool_choice"] = "auto"
                    else:
                        logger.debug("Not including tools for non-function query to prevent unwanted function calls")
            else:
                logger.debug("No tools available for this request")

            # Add generation parameters from config
            self._add_generation_params(api_params, llm_request.config)

            logger.debug(
                f"Transformers API params: {json.dumps(api_params, indent=2, default=str)}")

            if stream:
                async for response_chunk in self._stream_completion(api_params):
                    yield response_chunk
            else:
                # For non-streaming, use raw HTTP to handle server's buggy streaming response
                api_params["stream"] = False
                logger.debug("Using raw HTTP request for async non-streaming to handle potential streaming response")
                response = await self._make_raw_http_request_async(api_params)
                yield response

        except Exception as e:
            logger.error(f"Transformers API error: {e}")
            yield LlmResponse(
                error_code="TRANSFORMERS_API_ERROR",
                error_message=str(e)
            )

    def _parse_raw_streaming_response(self, response_text: str, has_function_responses: bool = False) -> LlmResponse:
        """Parse raw streaming response text into clean content."""
        content_parts = []
        
        for line in response_text.split('\n'):
            line = line.strip()
            if line.startswith('data: '):
                try:
                    data = json.loads(line[6:])  # Remove 'data: ' prefix
                    if 'choices' in data and len(data['choices']) > 0:
                        choice = data['choices'][0]
                        if 'delta' in choice and 'content' in choice['delta']:
                            content = choice['delta']['content']
                            if content:
                                content_parts.append(content)
                except json.JSONDecodeError:
                    continue
        
        # Join all content parts
        full_content = ''.join(content_parts)

        if full_content:
            # Only try to convert to function calls if no function responses are present
            allow_conversion = not has_function_responses
            function_call_part = self._try_parse_function_call_from_text(full_content, allow_conversion)
            if function_call_part:
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[function_call_part]
                    ),
                    finish_reason=types.FinishReason.STOP
                )
            else:
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part(text=full_content)]
                    ),
                    finish_reason=types.FinishReason.STOP
                )
        else:
            return LlmResponse(
                error_code="NO_CONTENT",
                error_message="No content found in streaming response"
            )

    def _convert_raw_response_to_llm_response(self, response_data: Dict[str, Any], has_function_responses: bool = False) -> LlmResponse:
        """Convert raw JSON response to LlmResponse."""
        try:
            if 'choices' not in response_data or not response_data['choices']:
                return LlmResponse(
                    error_code="NO_CHOICES",
                    error_message="No choices in response"
                )
            
            choice = response_data['choices'][0]
            message = choice.get('message', {})
            content = message.get('content', '')
            tool_calls = message.get('tool_calls', [])
            
            parts = []
            
            # Check if content looks like a function call JSON and convert it
            if content and not tool_calls:
                # Only try to convert to function calls if no function responses are present
                allow_conversion = not has_function_responses
                function_call_part = self._try_parse_function_call_from_text(content, allow_conversion)
                if function_call_part:
                    parts.append(function_call_part)
                else:
                    # Add as regular text content
                    parts.append(types.Part(text=content))
            elif content:
                # Add text content if present and we have tool calls too
                parts.append(types.Part(text=content))
                
            # Add tool calls if present
            if tool_calls:
                for tool_call in tool_calls:
                    try:
                        func_name = tool_call['function']['name']
                        func_args = json.loads(tool_call['function']['arguments']) if tool_call['function']['arguments'] else {}
                        
                        part = types.Part.from_function_call(
                            name=func_name,
                            args=func_args
                        )
                        if part.function_call:
                            part.function_call.id = tool_call.get('id', '')
                        parts.append(part)
                    except (KeyError, json.JSONDecodeError) as e:
                        logger.error(f"Error processing tool call: {e}")
                        continue
            
            if parts:
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=parts
                    ),
                    finish_reason=types.FinishReason.STOP
                )
            else:
                return LlmResponse(
                    error_code="NO_CONTENT",
                    error_message="No content in response"
                )
                
        except Exception as e:
            logger.error(f"Error converting raw response: {e}")
            return LlmResponse(
                error_code="RAW_CONVERSION_ERROR",
                error_message=str(e)
            )
                
    def _try_parse_function_call_from_text(self, content: str, allow_conversion: bool = True) -> Optional[types.Part]:
        """Try to parse function call from text content.
        
        Args:
            content: The text content to parse
            allow_conversion: Whether to allow conversion of text to function calls.
                             Set to False when function responses are present to prevent
                             converting natural language responses back to function calls.
        """
        # Don't convert text to function calls if conversion is disabled
        if not allow_conversion:
            logger.debug("Function call conversion disabled - treating as regular text")
            return None
            
        # Don't convert if the content looks like natural language rather than JSON
        content_stripped = content.strip()
        if not (content_stripped.startswith('{') and content_stripped.endswith('}')):
            logger.debug("Content doesn't look like JSON - treating as regular text")
            return None
            
        try:
            content = content.strip()
            
            # Try to parse as JSON
            if content.startswith('{') and content.endswith('}'):
                data = json.loads(content)
                
                # Check if it looks like a function call with "type": "function" format
                if data.get('type') == 'function' and 'function' in data and 'parameters' in data:
                    func_name = data['function']
                    func_args = data['parameters'] if isinstance(data['parameters'], dict) else {}
                    
                    part = types.Part.from_function_call(
                        name=func_name,
                        args=func_args
                    )
                    if part.function_call:
                        part.function_call.id = f"call_{hash(content) % 10000}"
                    logger.debug(f"Converted type:function text to proper function call: {func_name}")
                    return part
                
                # Check if it looks like a simple function call with "name" and "parameters"
                elif 'name' in data and 'parameters' in data:
                    func_name = data['name']
                    func_args = data['parameters'] if isinstance(data['parameters'], dict) else {}
                    
                    part = types.Part.from_function_call(
                        name=func_name,
                        args=func_args
                    )
                    if part.function_call:
                        part.function_call.id = f"call_{hash(content) % 10000}"
                    logger.debug(f"Converted name/parameters text to proper function call: {func_name}")
                    return part

                # Check for nested function call format
                elif 'function' in data and isinstance(data['function'], dict):
                    func_data = data['function']
                    if 'name' in func_data:
                        func_name = func_data['name']
                        func_args = func_data.get('parameters', {})
                        if isinstance(func_args, str):
                            try:
                                func_args = json.loads(func_args)
                            except json.JSONDecodeError:
                                func_args = {}
                        
                        part = types.Part.from_function_call(
                            name=func_name,
                            args=func_args
                        )
                        if part.function_call:
                            part.function_call.id = f"call_{hash(content) % 10000}"
                        logger.debug(f"Converted nested text function call to proper function call: {func_name}")
                        return part
                        
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.debug(f"Content is not a function call: {e}")
            
        return None
        
        
    def _looks_like_function_call_in_progress(self, content: str) -> bool:
        """Check if the accumulated content looks like a function call in progress.
        
        This helps prevent showing raw JSON or premature results during streaming.
        """
        content_stripped = content.strip()
        
        # Check if it starts with function call JSON patterns
        if content_stripped.startswith('{"name"') or content_stripped.startswith('{"type"'):
            return True
            
        # Check if it contains function call patterns but isn't complete yet
        if '{"name"' in content_stripped or '{"type"' in content_stripped:
            return True
            
        return False
        
    async def _make_raw_http_request_async(self, api_params: Dict[str, Any]) -> LlmResponse:
        """Make an async raw HTTP request when OpenAI client fails."""
        try:
            url = f"{self.base_url or 'http://localhost:4000/v1'}/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key or 'random_string'}"
            }
            
            # Ensure stream is False for non-streaming
            api_params["stream"] = False
            
            # Check if there are function responses in the messages
            messages = api_params.get("messages", [])
            has_function_responses = any(
                msg.get("role") == "tool" for msg in messages
            )
            logger.debug(f"Async function response detection: has_function_responses={has_function_responses}, message_count={len(messages)}")
            
            # Use asyncio to run the synchronous requests call
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: requests.post(url, json=api_params, headers=headers, timeout=self.timeout)
            )
            response.raise_for_status()
            response_text = response.text.strip()
            
            # Check if response is streaming format (starts with "data:")
            if response_text.startswith("data:"):
                # Parse streaming response manually
                return self._parse_raw_streaming_response(response_text, has_function_responses)
            else:
                # Parse as JSON
                response_data = response.json()
                return self._convert_raw_response_to_llm_response(response_data, has_function_responses)
                        
        except Exception as e:
            logger.error(f"Async raw HTTP request failed: {e}")
            return LlmResponse(
                error_code="ASYNC_RAW_HTTP_ERROR",
                error_message=str(e)
            )
                
    def _convert_contents_to_messages(self, contents: List[types.Content]) -> List[Dict[str, Any]]:
        """Converts ADK Content objects to Transformers message format."""
        messages = []
        
        for content in contents:
            # Handle function responses as tool messages
            if content.parts and any(part.function_response for part in content.parts):
                for part in content.parts:
                    if part.function_response:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": part.function_response.id,
                            "content": json.dumps(part.function_response.response)
                        })
            else:
                # Regular user/assistant messages
                message = {
                    "role": self._convert_role(content.role),
                    "content": self._convert_parts_to_content(content.parts or [])
                }
                
                # Add tool calls for assistant messages
                if content.role in ["model", "assistant"] and content.parts:
                    tool_calls = []
                    for part in content.parts:
                        if part.function_call:
                            tool_calls.append({
                                "id": part.function_call.id,
                                "type": "function",
                                "function": {
                                    "name": part.function_call.name,
                                    "arguments": json.dumps(part.function_call.args)
                                }
                            })
                    if tool_calls:
                        message["tool_calls"] = tool_calls
                
                messages.append(message)
            
        return messages
        
    def _convert_role(self, role: Optional[str]) -> str:
        """Converts ADK role to Transformers role."""
        if role in ["model", "assistant"]:
            return "assistant"
        elif role == "user":
            return "user"
        elif role == "system":
            return "system"
        else:
            return "user"  # Default fallback
            
    def _convert_parts_to_content(self, parts: List[types.Part]) -> Any:
        """Converts ADK Parts to Transformers content format."""
        content_parts = []
        
        for part in parts:
            if part.text:
                content_parts.append({
                    "type": "text",
                    "text": part.text
                })
            elif part.inline_data and part.inline_data.mime_type and part.inline_data.data:
                if part.inline_data.mime_type.startswith("image"):
                    # Handle image data
                    import base64
                    base64_data = base64.b64encode(part.inline_data.data).decode()
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{part.inline_data.mime_type};base64,{base64_data}"
                        }
                    })
                elif part.inline_data.mime_type.startswith("audio"):
                    # Handle audio data (for models that support it)
                    import base64
                    base64_data = base64.b64encode(part.inline_data.data).decode()
                    content_parts.append({
                        "type": "input_audio",
                        "input_audio": {
                            "data": base64_data,
                            "format": part.inline_data.mime_type.split("/")[-1]
                        }
                    })
            elif part.file_data and part.file_data.file_uri:
                # Handle image URLs directly
                if part.file_data.file_uri.startswith(("http://", "https://")):
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": part.file_data.file_uri
                        }
                    })
                else:
                    # Handle other file references as text
                    content_parts.append({
                        "type": "text",
                        "text": f"[File: {part.file_data.file_uri}]"
                    })
                    
        # Return single text if only one text part, otherwise return array
        if len(content_parts) == 1 and content_parts[0]["type"] == "text":
            return content_parts[0]["text"]
        
        return content_parts if content_parts else ""
    
    def _convert_tools(self, llm_request: LlmRequest) -> Optional[List[Dict[str, Any]]]:
        """Converts ADK tools to Transformers tools format."""
        if not llm_request.config.tools:
            return None
        
        tools = []
        for tool_config in llm_request.config.tools:
            # Check if this tool has function declarations
            if not hasattr(tool_config, 'function_declarations') or not tool_config.function_declarations:
                continue
                
            for func_decl in tool_config.function_declarations:
                tool = {
                    "type": "function",
                    "function": {
                        "name": func_decl.name,
                        "description": func_decl.description or "",
                    }
                }
                
                # Add parameters if present
                if hasattr(func_decl, 'parameters') and func_decl.parameters:
                    parameters = {
                        "type": "object",
                        "properties": {},
                    }
                    
                    if hasattr(func_decl.parameters, 'properties') and func_decl.parameters.properties:
                        for prop_name, prop_schema in func_decl.parameters.properties.items():
                            parameters["properties"][prop_name] = self._convert_schema(prop_schema)
                    
                    if hasattr(func_decl.parameters, 'required') and func_decl.parameters.required:
                        parameters["required"] = func_decl.parameters.required
                    
                    tool["function"]["parameters"] = parameters
                
                tools.append(tool)
        
        return tools if tools else None
        
    def _convert_schema(self, schema: types.Schema) -> Dict[str, Any]:
        """Converts ADK Schema to Transformers JSON schema format."""
        result = {}
        
        if schema.type:
            result["type"] = schema.type.value.lower() if hasattr(schema.type, 'value') else str(schema.type).lower()
        
        if schema.description:
            result["description"] = schema.description
        
        if schema.properties:
            result["properties"] = {
                name: self._convert_schema(prop_schema) 
                for name, prop_schema in schema.properties.items()
            }
        
        if schema.items:
            result["items"] = self._convert_schema(schema.items)
        
        if schema.enum:
            result["enum"] = schema.enum
            
        return result
    
    def _add_generation_params(self, api_params: Dict[str, Any], config: types.GenerateContentConfig):
        """Adds generation parameters from config to API params."""
        if config.temperature is not None:
            api_params["temperature"] = config.temperature
        
        if config.max_output_tokens is not None:
            api_params["max_tokens"] = config.max_output_tokens
        
        if config.top_p is not None:
            api_params["top_p"] = config.top_p
        
        if config.stop_sequences:
            api_params["stop"] = config.stop_sequences
        
        if config.presence_penalty is not None:
            api_params["presence_penalty"] = config.presence_penalty
        
        if config.frequency_penalty is not None:
            api_params["frequency_penalty"] = config.frequency_penalty
            

    async def _stream_completion(self, api_params: Dict[str, Any]) -> AsyncGenerator[LlmResponse, None]:
        """Handles streaming completion from Transformers."""
        accumulated_content = ""
        accumulated_tool_calls = {}
        
        try:
            # Create streaming completion
            stream = await self._transformers_client.chat.completions.create(**api_params)
            
            async for chunk in stream:
                # Handle the case where chunk might be a string or have different structure
                if isinstance(chunk, str):
                    # If chunk is a string, treat it as content
                    accumulated_content += chunk
                    yield LlmResponse(
                        content=types.Content(
                            role="model",
                            parts=[types.Part(text=chunk)]
                        ),
                        partial=True
                    )
                    continue
                
                # Handle standard Transformers chunk format
                if not hasattr(chunk, 'choices') or not chunk.choices:
                    continue
                    
                choice = chunk.choices[0]
                delta = choice.delta
                
                # Handle text content - yield each token as it comes
                if hasattr(delta, 'content') and delta.content:
                    token = delta.content
                    accumulated_content += token
                    
                    # Don't yield tokens if the accumulated content looks like a function call
                    # This prevents showing raw JSON or premature results before function execution
                    if not self._looks_like_function_call_in_progress(accumulated_content):
                        yield LlmResponse(
                            content=types.Content(
                                role="model",
                                parts=[types.Part(text=token)]
                            ),
                            partial=True
                        )
                        
                # Handle tool calls (accumulate for final response)
                if hasattr(delta, 'tool_calls') and delta.tool_calls:
                    for tool_call in delta.tool_calls:
                        if tool_call.index not in accumulated_tool_calls:
                            accumulated_tool_calls[tool_call.index] = {
                                "id": tool_call.id or "",
                                "name": "",
                                "arguments": ""
                            }
                        
                        if tool_call.function and tool_call.function.name:
                            accumulated_tool_calls[tool_call.index]["name"] += tool_call.function.name
                        
                        if tool_call.function and tool_call.function.arguments:
                            accumulated_tool_calls[tool_call.index]["arguments"] += tool_call.function.arguments
                
                # Handle completion
                if hasattr(choice, 'finish_reason') and choice.finish_reason:
                    parts = []
                    
                    # Check if we have accumulated content that looks like a function call
                    if accumulated_content:
                        function_call_part = self._try_parse_function_call_from_text(accumulated_content, allow_conversion=True)
                        if function_call_part:
                            # This is a function call - yield it as a function call response
                            yield LlmResponse(
                                content=types.Content(role="model", parts=[function_call_part]),
                                finish_reason=self._convert_finish_reason(choice.finish_reason)
                            )
                        else:
                            # Regular text content
                            parts.append(types.Part(text=accumulated_content))
                            
                    # Handle tool calls from proper tool_calls format
                    for tool_call_data in accumulated_tool_calls.values():
                        if tool_call_data["name"]:
                            try:
                                args = json.loads(tool_call_data["arguments"]) if tool_call_data["arguments"] else {}
                            except json.JSONDecodeError:
                                args = {}
                            
                            part = types.Part.from_function_call(
                                name=tool_call_data["name"],
                                args=args
                            )
                            if part.function_call:
                                part.function_call.id = tool_call_data["id"]
                            parts.append(part)
                    
                    # Yield final response if we have parts (for tool calls or regular text)
                    if parts:
                        yield LlmResponse(
                            content=types.Content(role="model", parts=parts),
                            finish_reason=self._convert_finish_reason(choice.finish_reason)
                        )
                        
        except Exception as e:
            logger.error(f"Error in streaming completion: {e}")
            # If there's accumulated content, yield it as final response
            if accumulated_content:
                yield LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part(text=accumulated_content)]
                    ),
                    finish_reason=types.FinishReason.STOP
                )
                    
    def _convert_finish_reason(self, transformers_finish_reason: Optional[str]) -> Optional[types.FinishReason]:
        """Converts Transformers finish reason to ADK finish reason."""
        if transformers_finish_reason == "stop":
            return types.FinishReason.STOP
        elif transformers_finish_reason == "length":
            return types.FinishReason.MAX_TOKENS
        elif transformers_finish_reason == "tool_calls":
            return types.FinishReason.STOP
        elif transformers_finish_reason == "content_filter":
            return types.FinishReason.SAFETY
        else:
            return types.FinishReason.FINISH_REASON_UNSPECIFIED