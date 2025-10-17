# AI Chat Interface

A React-based chat interface that connects to the ADK (Agent Development Kit) backend using Server-Sent Events (SSE) for real-time streaming responses.

## Features

- **Real-time streaming**: Messages stream in real-time using SSE
- **Session management**: Each chat session has a unique ID
- **Agent awareness**: Shows which agent is currently responding
- **Message history**: Maintains conversation history within a session
- **Responsive design**: Works on desktop and mobile devices
- **Error handling**: Graceful error handling with user feedback
- **Request cancellation**: Ability to cancel ongoing requests

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Make sure your ADK backend is running on `http://localhost:8080`

## Configuration

You can modify the API configuration in `src/config.js`:

```javascript
export const config = {
  apiBaseUrl: 'http://localhost:8080',  // Your ADK backend URL
  defaultUserId: 'user_001',            // Default user ID
  defaultAppName: 'sample_agent'                 // Default app name
};
```

## API Integration

The chat interface uses the `/run_sse` endpoint with the following request structure:

```javascript
{
  "appName": "sample_agent",
  "userId": "user_001", 
  "sessionId": "unique-session-id",
  "newMessage": {
    "parts": [
      {
        "text": "User message content"
      }
    ],
    "role": "user"
  },
  "streaming": true
}
```

## Components

- **Chat.jsx**: Main chat interface component
- **useSSEChat.js**: Custom hook for managing SSE communication
- **config.js**: Configuration settings

## Usage

1. Type your message in the input field
2. Press Enter or click Send to send the message
3. Watch as the AI response streams in real-time
5. Cancel ongoing requests using the Cancel button

## Styling

The interface uses styled-components for styling with a clean, modern design:
- Blue header with session information
- Message bubbles with different colors for user/AI
- Responsive layout that works on all screen sizes
- Loading indicators and error states