import { useState, useCallback } from 'react';
import styles from './App.module.css'

export default function App() {
    const [description, setDescription] = useState('');
  const [events, setEvents] = useState([]);
  const [artifactName, setArtifactName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const adkBackendUrl = 'http://localhost:8080'; // Your ADK backend URL
  const appName = 'sample_agent'; // Your ADK app name

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      setError('Please enter an adventure description.');
      return;
    }

    setEvents([]);
    setArtifactName('');
    setError('');
    setIsLoading(true);

    const userId = 'user';
    const sessionId = '81caebb9-a385-4acd-b532-6154ee9005fd';

    const requestBody = {
      app_name: appName,
      user_id: userId,
      session_id: sessionId,
      new_message: {
        role: 'user',
        parts: [{ text: description }],
      },
    };

    try {
      const response = await fetch(`${adkBackendUrl}/run_sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText || 'Server error'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // Buffer to handle partial messages

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream complete');
            if (buffer.trim()) { // Process any remaining buffered data
                console.warn('Processing remaining buffer at stream end:', buffer);
                 // This case should ideally not happen if SSE messages are well-formed
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');

          while (boundary !== -1) {
            const message = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 2); // Skip the '\n\n'

            if (message.startsWith('data: ')) {
              try {
                const eventDataJson = message.substring(6).trim();
                if (eventDataJson) {
                  const eventData = JSON.parse(eventDataJson);
                  setEvents(prevEvents => [...prevEvents, eventData]);

                  if (eventData.author === 'KMLGeneratorAgent' && eventData.content && eventData.content.parts) {
                    const textPart = eventData.content.parts.find(p => p.text);
                    if (textPart && textPart.text.includes("KML file generated and saved as artifact:")) {
                      setArtifactName(textPart.text);
                    }
                  }
                }
              } catch (e) {
                console.error('Error parsing SSE event JSON:', e, 'Raw message part:', message);
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      };

      await processStream();

    } catch (err) {
      console.error('Failed to create adventure map:', err);
      setError(`Failed to process adventure: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [description, appName, adkBackendUrl]);

  return (
    <div className={styles.container}>
      <header>
        <h1 className={styles.title}>Personalized Adventure Map Creator</h1>
        <p className={styles.subtitle}>
          Describe your desired adventure, and we'll generate a KML map layer for you!
        </p>
      </header>

      <main>
        <section>
          <label htmlFor="adventureDescription" className={styles.formLabel}>Your Adventure Idea:</label>
          <textarea
            id="adventureDescription"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., A scenic drive through the Swiss Alps, focusing on lakes and mountain passes..."
            rows={5}
            disabled={isLoading}
          />
          <button onClick={handleSubmit} disabled={isLoading} className={styles.button}>
            {isLoading ? 'Generating...' : 'Create Adventure Map'}
          </button>
        </section>

        {isLoading && <div className={styles.loader} aria-label="Loading..."></div>}

        {error && <div className={styles.errorArea}>Error: {error}</div>}

        <section >
          <h2 className={styles.sectionTitle}>Agent Journey:</h2>
          <div className={styles.responseArea}>
            {events.length === 0 && !isLoading && !error && <p>The step-by-step process of map generation will appear here.</p>}
            {events.map((event, index) => {
              let contentText = "Event has non-textual content or is empty.";
              if (event.content && event.content.parts) {
                const textPart = event.content.parts.find(p => p.text);
                if (textPart) {
                  contentText = textPart.text;
                } else if (event.content.parts.length > 0) {
                  const firstPart = event.content.parts[0];
                  if (firstPart.function_call) {
                    contentText = `Tool Call: ${firstPart.function_call.name}(${JSON.stringify(firstPart.function_call.args || {})})`;
                  } else if (firstPart.function_response) {
                    contentText = `Tool Response for ${firstPart.function_response.name}: ${JSON.stringify(firstPart.function_response.response || {})}`;
                  } else {
                     try { contentText = `Structured event part: ${JSON.stringify(firstPart, null, 2)}`; } catch (e) { /* ignore */ }
                  }
                }
              } else if (event.actions && Object.keys(event.actions.state_delta || {}).length > 0) {
                  contentText = `State updated: ${JSON.stringify(event.actions.state_delta)}`;
              }

              return (
                <div key={event.id || index} className={styles.event}>
                  <span className={styles.eventAuthor}>{event.author || 'System Event'}:</span>
                  <span className={styles.eventContent}>{contentText}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Generated KML File:</h2>
          <div className={styles.artifactArea}>
            {artifactName ? (
              <p>{artifactName} <br/> (You can download this from the "Artifacts" tab in the ADK Web UI at {adkBackendUrl} for the session: {appName})</p>
            ) : (
              <p>No KML file generated yet.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
