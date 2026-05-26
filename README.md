<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/563adc28-c542-4d97-b382-77e88418f5b3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` with your Gemini API key:
   ```
   GEMINI_API_KEY=your_key_here
   ```
   Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Run the app (API + frontend on port 3000):
   `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000)

For production after build:
   `npm run build && npm start`
