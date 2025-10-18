/**
 * SSE Parser for React Chat Interface
 * 
 * Handles parsing of Server-Sent Event data from the ADK backend,
 * extracting text content, function calls, function responses, and thoughts.
 */

/**
 * Extracts and processes data from SSE JSON strings
 * 
 * @param {string} data - Raw SSE data string to parse
 * @returns {Object} Structured data object with extracted information
 */
export function extractDataFromSSE(data) {
    try {
        const parsed = JSON.parse(data);

        console.log('📄 [SSE PARSER] Raw parsed JSON:', {
            hasContent: !!parsed.content,
            hasParts: !!(parsed.content && parsed.content.parts),
            partsLength: parsed.content?.parts?.length || 0,
            author: parsed.author,
            id: parsed.id,
        });

        let textParts = [];
        let agent = '';
        let functionCall = undefined;
        let functionResponse = undefined;
        let thoughtParts = [];

        // Extract message ID from backend
        const messageId = parsed.id;

        // Extract content from parts
        if (parsed.content && parsed.content.parts) {
            console.log('🔍 [SSE PARSER] Processing content.parts:', {
                partsCount: parsed.content.parts.length,
                parts: parsed.content.parts.map((part, index) => ({
                    index,
                    hasText: !!part.text,
                    hasThought: !!part.thought,
                    hasFunctionCall: !!part.functionCall,
                    hasFunctionResponse: !!part.functionResponse,
                    textPreview: part.text ? part.text.substring(0, 100) + '...' : 'no text',
                })),
            });

            // Process each part
            for (const part of parsed.content.parts) {
                // Extract regular text (not thoughts)
                if (part.text && !part.thought) {
                    textParts.push(part.text);
                }

                // Extract thoughts separately
                if (part.text && part.thought) {
                    thoughtParts.push(part.text);
                }

                // Extract function calls
                if (part.functionCall) {
                    functionCall = {
                        name: part.functionCall.name,
                        args: part.functionCall.args || {},
                        id: part.functionCall.id,
                    };
                }

                // Extract function responses
                if (part.functionResponse) {
                    functionResponse = {
                        name: part.functionResponse.name,
                        response: part.functionResponse.response || {},
                        id: part.functionResponse.id,
                    };
                }
            }

            console.log('🧠 [SSE PARSER] Extraction results:', {
                textPartsCount: textParts.length,
                thoughtPartsCount: thoughtParts.length,
                hasFunctionCall: !!functionCall,
                hasFunctionResponse: !!functionResponse,
                functionCallName: functionCall?.name,
                functionResponseName: functionResponse?.name,
            });
        }

        // Extract agent information
        if (parsed.author) {
            agent = parsed.author;
        }

        return {
            messageId,
            textParts,
            thoughtParts,
            agent,
            functionCall,
            functionResponse,
        };
    } catch (error) {
        console.error('❌ [SSE PARSER] Error parsing SSE data:', error);
        console.error('❌ [SSE PARSER] Problematic data:', data.substring(0, 200) + '...');

        return {
            messageId: undefined,
            textParts: [],
            thoughtParts: [],
            agent: '',
            functionCall: undefined,
            functionResponse: undefined,
        };
    }
}

/**
 * Formats function call information for display
 * 
 * @param {string} name - Function name
 * @param {Object} args - Function arguments
 * @returns {string} Formatted display string
 */
export function formatFunctionCall(name, args) {
    const argCount = Object.keys(args).length;
    return `${name}(${argCount} argument${argCount !== 1 ? 's' : ''})`;
}

/**
 * Formats function response information for display
 * 
 * @param {string} name - Function name
 * @param {Object} response - Function response data
 * @returns {string} Formatted display string
 */
export function formatFunctionResponse(name, response) {
    const hasResponse = Object.keys(response).length > 0;
    return `${name} → ${hasResponse ? 'Response received' : 'No response'}`;
}