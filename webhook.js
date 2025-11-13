const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));

app.post('/webhook', (req, res) => {
  const incomingMessage = req.body.Body;
  console.log('Message received:', incomingMessage);
  
  // Your AI logic here (call ChatGPT, your model, etc.)
  let responseText = "Default response";
  
  // Example: simple echo
  if (incomingMessage) {
    responseText = `You said: ${incomingMessage}`;
  }
  
  // Send XML response back to Twilio
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${responseText}</Message>
</Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
