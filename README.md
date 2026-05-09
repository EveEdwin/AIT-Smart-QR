<<<<<<< HEAD
# AIT-Smart-QR
QR Management 
=======
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8bff3a7f-cb99-4728-b44e-aea48f49b0a9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the environment variables in [.env](.env) for Gemini and Supabase
3. Apply the SQL schema in [supabase/schema.sql](supabase/schema.sql) to your Supabase project
4. Run the app:
   `npm run dev`

## Supabase Studio Note

Paste [supabase/schema.sql](supabase/schema.sql) into the Supabase SQL Editor and run it once against the project. After that, confirm Google auth is enabled in Supabase Auth and the `QR-files` storage bucket exists with public reads and authenticated uploads.
>>>>>>> 3f08462 (Migrate Firebase app to Supabase with schema and auth fixes)
