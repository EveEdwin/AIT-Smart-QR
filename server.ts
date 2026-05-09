import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://invalid.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "invalid-anon-key";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Dynamic QR Redirection Logic
  app.get("/r/:slug", async (req, res, next) => {
    const { slug } = req.params;
    try {
      const { data, error } = await supabase
        .from("qrcodes")
        .select("type,content,targetUrl")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        console.error("Supabase redirect lookup error:", error);
        return next();
      }

      if (!data) {
        return next(); // Let SPA handle 404 or possible match
      }

      const type = data.type || 'link';
      const contentValue = data.content?.value || data.targetUrl;

      // If it's text or file, we show the landing page in the SPA
      if (type === 'text' || type === 'file') {
        return next();
      }

      if (!contentValue) {
        return next();
      }

      // Ensure contentValue has a protocol
      const redirectUrl = contentValue.startsWith("http") ? contentValue : `https://${contentValue}`;
      
      console.log(`Redirecting ${slug} to ${redirectUrl}`);
      
      // Use 302 Found (Temporary Redirect) so the browser doesn't cache the destination.
      // This is essential for "Dynamic" QR codes where the target can change.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.redirect(302, redirectUrl);
    } catch (error) {
      console.error("Redirection error:", error);
      // Instead of 500, let it fall through to SPA which might have better error handling or just fail gracefully
      next();
    }
  });

  // 2. Vite Middleware for Dashboard
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
