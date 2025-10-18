import os
import datetime
from zoneinfo import ZoneInfo
from google.adk.agents import Agent
import sys
import os
sys.path.append(os.path.dirname(__file__))
from transformers_llm import TransformersLlm

AGENT_MODEL = "meta-llama/Llama-3.2-1B-Instruct"

def get_weather(city: str) -> dict:
    """Retrieves the current weather report for a specified city.

    Args:
        city (str): The name of the city for which to retrieve the weather report.

    Returns:
        dict: status and result or error msg.
    """
    if city.lower() == "singapore":
        return {
            "status": "success",
            "report": (
                "Singapore is experiencing partly cloudy conditions with a temperature of 30癈 and high humidity."
                " There's a chance of afternoon thunderstorms."
            ),
        }
    else:
        return {
            "status": "error",
            "error_message": f"Weather information for '{city}' is not available.",
        }

def get_current_time(city: str) -> dict:
    """Returns the current time in a specified city.

    Args:
        city (str): The name of the city for which to retrieve the current time.

    Returns:
        dict: status and result or error msg.
    """

    if city.lower() == "new york":
        tz_identifier = "America/New_York"
    else:
        return {
            "status": "error",
            "error_message": (
                f"Sorry, I don't have timezone information for {city}."
            ),
        }

    tz = ZoneInfo(tz_identifier)
    now = datetime.datetime.now(tz)
    report = (
        f'The current time in {city} is {now.strftime("%Y-%m-%d %H:%M:%S %Z%z")}'
    )
    return {"status": "success", "report": report}

root_agent = Agent(
    name="general_chat_agent",
    model=TransformersLlm(
        model=AGENT_MODEL,
        base_url="http://localhost:4000/v1",
        api_key="random_string" 
    ),
    description=(
        "Agent to answer questions about the time and weather in a city."
    ),
    instruction=(
        "You are a helpful agent who can answer user questions about the time and weather in a city."
    ),
    tools=[get_weather, get_current_time],
)