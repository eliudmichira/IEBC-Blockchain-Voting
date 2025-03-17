const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();

// Enhanced CORS config
app.use(cors({
  origin: 'http://localhost:8080',  // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Updated CSP headers to allow eval and connections
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 ws://localhost:8000 wss://localhost:8000; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https://*; frame-src 'self'"
  );
  next();
});

// JSON and URL encoding middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Improved proxy implementation
app.use('/proxy', (req, res) => {
  const apiHost = 'localhost';
  const apiPort = 8000;
  
  let targetPath = req.url || '/';

  const fullUrl = `http://${apiHost}:${apiPort}${targetPath}`;
  console.log(`Proxying request to: ${fullUrl}`);

  const options = {
    hostname: apiHost,
    port: apiPort,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${apiHost}:${apiPort}`
    }
  };

  delete options.headers['content-length'];
  delete options.headers['connection'];

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: `Proxy error: ${err.message}` });
    }
  });

  if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  proxyReq.end();
});

// Serve static files
app.use('/js', express.static(path.join(__dirname, 'src/js')));
app.use('/css', express.static(path.join(__dirname, 'src/css')));
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));
app.use('/dist', express.static(path.join(__dirname, 'src/dist')));
app.use('/build', express.static(path.join(__dirname, 'build')));
app.use('/html', express.static(path.join(__dirname, 'src/html')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/html/login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/html/login.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/html/index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/html/admin.html'));
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/favicon.ico'));
});

// API test endpoint (simplified)
app.get('/test-api', (req, res) => {
  res.json({ status: 'success', message: 'Express server is working' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Server error',
    error: err.message
  });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`API proxy available at http://localhost:${PORT}/proxy`);
});
