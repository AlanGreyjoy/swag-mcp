import fetch from 'node-fetch';
import { EventSource } from 'eventsource';

async function findPetsBySold() {
  try {
    // First check if server is ready
    const healthResponse = await fetch('http://localhost:3000/health');
    const health = await healthResponse.json();
    
    if (health.mcpServer !== 'initialized') {
      console.error('Server is not ready. Please wait for it to initialize.');
      return;
    }

    // Create SSE connection
    const eventSource = new EventSource('http://localhost:3000/sse');
    
    eventSource.onopen = async () => {
      console.log('SSE connection opened');
      
      // Send the request
      try {
        const response = await fetch('http://localhost:3000/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'invoke',
            tool: 'findPetsByStatus',
            input: {
              status: ['sold']
            }
          })
        });
        
        const data = await response.json();
        console.log('Response:', data);
        eventSource.close();
      } catch (error) {
        console.error('Error sending message:', error.message);
        eventSource.close();
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };
    
    eventSource.onmessage = (event) => {
      console.log('Received:', event.data);
    };
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('Make sure the server is running on port 3000');
    }
  }
}

// Run the test
findPetsBySold(); 