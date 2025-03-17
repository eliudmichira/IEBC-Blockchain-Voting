# BLOCKCHAIN-BASED ELECTORAL MANAGEMENT SYSTEM FOR IEBC

A secure, transparent, and decentralized voting system built for the Independent Electoral and Boundaries Commission of Kenya using blockchain technology.

## Features

- Implements JWT for secure voter authentication and authorization
- Utilizes Ethereum blockchain for tamper-proof and transparent voting records
- Removes the need for intermediaries, ensuring a trustless voting process
- Admin panel to manage candidates, set voting dates, and monitor results
- Intuitive UI for voters to cast votes and view candidate information
- Support for both traditional ID-based login and MetaMask wallet authentication

## Technologies Used

- Ethereum Blockchain
- Web3.js
- Node.js
- Express
- HTML/CSS/JavaScript
- MetaMask Integration
- Truffle Framework

## Getting Started

### Prerequisites

- Node.js
- MetaMask browser extension
- Ganache (for local blockchain development)
- Truffle (for smart contract deployment)

### Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the local blockchain with Ganache
4. Deploy the smart contracts: `truffle migrate --reset`
5. Start the application: `npm start`
6. Access the application at http://localhost:8080

## License

This project is licensed under the MIT License - see the LICENSE file for details.

# 🗳️ Ethereum-Based Decentralized Voting System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18.14.0-green)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Latest-blue)](https://fastapi.tiangolo.com/)
[![Ethereum](https://img.shields.io/badge/Ethereum-Blockchain-lightgrey)](https://ethereum.org/)

A secure, transparent, and tamper-proof voting platform built on Ethereum blockchain technology. This system eliminates the need for centralized authorities while ensuring vote integrity, voter anonymity, and complete transparency of election results.

## ✨ Key Features

- **Blockchain Security** - All votes are stored on Ethereum blockchain, making them immutable and verifiable
- **JWT Authentication** - Secure voter authentication with JSON Web Tokens
- **Zero Intermediaries** - Trustless voting without central authorities
- **Admin Dashboard** - Comprehensive controls for election management
- **User-Friendly Interface** - Intuitive design for voters of all technical levels
- **Real-Time Results** - Immediate and transparent vote counting
- **Voter Privacy** - Maintains voter anonymity while ensuring vote verification

## 🛠️ Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, FastAPI (Python)
- **Blockchain**: Ethereum, Solidity, Truffle, Ganache
- **Authentication**: JWT (JSON Web Tokens)
- **Database**: MySQL
- **Wallet Integration**: MetaMask

## 📷 Screenshots

## 📋 Prerequisites

- Node.js (v18.14.0 or later)
- MetaMask browser extension
- Python 3.9+
- MySQL database
- Ganache (local blockchain)
- Truffle framework

## 🚀 Installation Guide

### 1. Clone the Repository

### 2. Set Up Blockchain Environment

1. Download and install [Ganache](https://trufflesuite.com/ganache/)
2. Create a workspace named `development`
3. Add the project's `truffle-config.js` in Ganache's truffle projects section

### 3. Configure MetaMask

1. Install [MetaMask](https://metamask.io/download/) extension
2. Create or import a wallet
3. Add a custom network with these settings:
   - Network Name: Localhost 7575
   - RPC URL: http://localhost:7545
   - Chain ID: 1337
   - Currency Symbol: ETH
4. Import accounts from Ganache to MetaMask

### 4. Database Setup

1. Create a MySQL database named `voter_db`
2. Set up the voters table:

```sql
CREATE TABLE voters (
    voter_id VARCHAR(36) PRIMARY KEY NOT NULL,
    role ENUM('admin', 'user') NOT NULL,
    password VARCHAR(255) NOT NULL
);
```

3. Update database credentials in `./Database_API/.env`

### 5. Install Dependencies

```bash
# Install Truffle globally
npm install -g truffle

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install fastapi mysql-connector-python pydantic python-dotenv uvicorn uvicorn[standard] PyJWT
```

## 🔧 Running the Application

### 1. Prepare the Environment

Ensure Ganache is running with the `development` workspace opened.

### 2. Compile and Deploy Smart Contracts

```bash
# Enter truffle console
truffle console

# Compile contracts (within truffle console)
compile

# Exit truffle console
.exit

# Migrate contracts to local blockchain
truffle migrate
```

### 3. Build JavaScript Bundle

```bash
browserify ./src/js/app.js -o ./src/dist/app.bundle.js
```

### 4. Start the Application Servers

Terminal 1 - Start the Node.js server:
```bash
node index.js
```

Terminal 2 - Start the Database API:
```bash
cd Database_API
uvicorn main:app --reload --host 127.0.0.1
```

### 5. Access the Application

Open your browser and navigate to: http://localhost:8080/

## 📂 Project Structure

```
├── build/                     # Compiled contract artifacts
│   └── contracts/              
├── contracts/                 # Smart contract source code
│   ├── Migrations.sol          
│   └── Voting.sol             
├── Database_API/              # Database API service
│   └── main.py                
├── migrations/                # Ethereum contract deployment scripts
├── public/                    # Public assets
├── src/                       # Application source code
│   ├── assets/                # Images and media
│   ├── css/                   # Stylesheets
│   ├── dist/                  # Compiled JS bundles
│   ├── html/                  # HTML templates
│   └── js/                    # JavaScript logic
├── index.js                   # Main Node.js entry point
├── package.json               # Node.js dependencies
└── truffle-config.js          # Truffle configuration
```

## 💡 Use Cases

- **National Elections** - Secure and transparent voting for government elections
- **Corporate Governance** - Shareholder voting for board decisions
- **University Elections** - Student body elections with verifiable results
- **Community Decision Making** - Decentralized voting for community proposals

## 🔍 How It Works

1. **Administrator Setup**: Election officials create candidates and set voting timeframes
2. **Voter Registration**: Eligible voters receive credentials and connect their MetaMask wallets
3. **Voting Process**: Voters authenticate, view candidates, and cast encrypted votes
4. **Blockchain Recording**: Votes are verified and permanently recorded on the Ethereum blockchain
5. **Result Tabulation**: Smart contracts automatically tally votes for transparent counting

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/Krish-Depani/Decentralized-Voting-System-Using-Ethereum-Blockchain/blob/main/LICENSE) file for details.

## ⭐ Support

If you find this project useful, please consider giving it a star on GitHub!

## 📧 Contact

For questions or feedback, please reach out or open an issue on GitHub.

---

**Disclaimer**: This project is currently not maintained. Use at your own risk for educational and demonstration purposes.

# Kenya Blockchain Electoral Login Component

A React component for Kenya's electoral system that provides secure authentication using both National ID verification and blockchain wallet signatures.

## Features

- **Dual Authentication Methods**:
  - National ID + password with blockchain verification
  - Direct blockchain wallet authentication

- **Multi-step Verification Process**:
  - Step 1: Initial credentials entry
  - Step 2: Blockchain challenge-response verification
  - Step 3: Success confirmation with session details

- **Kenya-specific Elements**:
  - IEBC branding and color scheme
  - Constituency selection
  - National ID verification

- **Security Features**:
  - Challenge-response cryptographic verification
  - JWT token authentication
  - Secure session management
  - Offline mode support

## Installation

```bash
# Install dependencies
npm install ethers axios
```

## Usage

```jsx
import { KenyaBlockchainLogin } from './components/auth';

function App() {
  return (
    <div className="App">
      <KenyaBlockchainLogin />
    </div>
  );
}
```

## API Integration

The component is designed to work with the following API endpoints:

- `/api/auth/login` - Traditional login with National ID and password
- `/api/auth/verify-wallet` - Get challenge for wallet verification
- `/api/auth/validate-signature` - Validate signature for wallet verification
- `/api/data/constituencies` - Get list of constituencies

## Environment Variables

Create a `.env` file with the following variables:

```
REACT_APP_API_BASE_URL=http://your-api-url.com/api
```

## Integration Steps

1. **Configure API Endpoints**:
   - Update the API base URL in your environment variables
   - Ensure your backend implements the required endpoints

2. **Connect Authentication System**:
   - The component uses JWT tokens stored in localStorage
   - Implement token validation in your backend
   - Configure token expiration and refresh mechanisms

3. **Update Database Schema**:
   - Link wallet addresses to National IDs in your database
   - Store constituency data for voters
   - Track voting eligibility and status

4. **Error Handling**:
   - The component includes offline mode for development/testing
   - Implement proper error handling in your API endpoints
   - Configure fallback mechanisms for API failures

## Component Structure

- `KenyaBlockchainLogin.jsx` - Main component
- `KenyaBlockchainLogin.css` - Styling
- `icons.css` - Icon definitions
- `authService.js` - Authentication service
- `dataService.js` - Data service for constituencies
- `blockchainUtils.js` - Blockchain utility functions

## Offline Mode

The component includes an offline mode for development and testing:

- Automatically activates when API calls fail
- Uses mock data for constituencies
- Simulates authentication flow
- Stores session data in localStorage

## Security Considerations

- Implement rate limiting on your authentication endpoints
- Use HTTPS for all API communications
- Store passwords with proper hashing (bcrypt recommended)
- Implement proper validation for National IDs
- Consider implementing additional security measures like 2FA

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Independent Electoral and Boundaries Commission of Kenya
- MetaMask for wallet integration
- Ethers.js for blockchain interactions