const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/js', express.static(path.join(__dirname, 'src/js')));
app.use('/css', express.static(path.join(__dirname, 'src/css')));
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));
app.use('/dist', express.static(path.join(__dirname, 'src/dist')));
app.use('/build', express.static(path.join(__dirname, 'build')));
app.use(express.static(path.join(__dirname, 'public')));

// Mock API endpoints for development
app.get('/api/data/constituencies', (req, res) => {
  const constituencies = [
    { id: 'westlands', name: 'Westlands' },
    { id: 'dagoretti_north', name: 'Dagoretti North' },
    { id: 'dagoretti_south', name: 'Dagoretti South' },
    { id: 'langata', name: 'Langata' },
    { id: 'kibra', name: 'Kibra' },
    { id: 'roysambu', name: 'Roysambu' },
    { id: 'kasarani', name: 'Kasarani' },
    { id: 'ruaraka', name: 'Ruaraka' },
    { id: 'embakasi_south', name: 'Embakasi South' },
    { id: 'embakasi_north', name: 'Embakasi North' },
    { id: 'embakasi_central', name: 'Embakasi Central' },
    { id: 'embakasi_east', name: 'Embakasi East' },
    { id: 'embakasi_west', name: 'Embakasi West' },
    { id: 'makadara', name: 'Makadara' },
    { id: 'kamukunji', name: 'Kamukunji' },
    { id: 'starehe', name: 'Starehe' },
    { id: 'mathare', name: 'Mathare' }
  ];
  res.json(constituencies);
});

app.post('/api/auth/login', (req, res) => {
  const { nationalId, password } = req.body;
  
  // Mock authentication
  if (nationalId && password) {
    res.json({
      token: 'mock_jwt_token_' + Math.random().toString(36).substring(2),
      userId: nationalId,
      role: nationalId === 'ADMIN123' ? 'admin' : 'voter',
      requireWalletVerification: true,
      expiresIn: 3600
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/api/auth/verify-wallet', (req, res) => {
  const { address } = req.query;
  
  if (address) {
    res.json({
      challenge: `IEBC-Verify-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`
    });
  } else {
    res.status(400).json({ message: 'Wallet address is required' });
  }
});

app.post('/api/auth/validate-signature', (req, res) => {
  const { address, challenge, signature, nationalId } = req.body;
  
  if (address && challenge && signature) {
    res.json({
      token: 'mock_jwt_token_' + Math.random().toString(36).substring(2),
      userId: nationalId || address,
      role: nationalId === 'ADMIN123' ? 'admin' : 'voter',
      expiresIn: 3600,
      voterData: {
        voterId: 'KE' + Math.floor(Math.random() * 1000000),
        constituency: req.body.constituency || 'Westlands',
        isEligible: true,
        hasVoted: false
      }
    });
  } else {
    res.status(400).json({ message: 'Invalid signature verification data' });
  }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// Serve static files from the src/html directory for development
app.use(express.static(path.join(__dirname, 'src', 'html')));

// Fallback route for HTML files in development
app.get('/:page.html', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'src', 'html', `${page}.html`));
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'html', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
  console.log(`Login page available at http://localhost:${PORT}/login.html`);
}); 