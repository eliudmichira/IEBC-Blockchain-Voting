import logging
import traceback
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
import jwt
from pydantic import BaseModel, Field, validator
from web3 import Web3
import json
from functools import lru_cache
import os

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Decentralized Voting API",
    description="API for a decentralized voting system using Ethereum blockchain",
    version="1.0.0"
)

# CORS Configuration - Allow all origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"]  # Expose all headers
)

# Debug middleware for CORS
@app.middleware("http")
async def debug_cors_headers(request: Request, call_next):
    logger.debug(f"Incoming request: {request.method} {request.url}")
    logger.debug(f"Headers: {request.headers}")
    
    response = await call_next(request)
    
    # Log response headers for debugging
    logger.debug(f"Response status: {response.status_code}")
    logger.debug(f"Response headers: {response.headers}")
    
    # Force CORS headers for all responses if missing
    if 'access-control-allow-origin' not in response.headers:
        origin = request.headers.get('origin')
        if origin:
            response.headers['access-control-allow-origin'] = origin
        else:
            response.headers['access-control-allow-origin'] = '*'
        response.headers['access-control-allow-credentials'] = 'true'
        response.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['access-control-allow-headers'] = 'Authorization, Content-Type, Accept'
        response.headers['access-control-max-age'] = '86400'
    
    return response

# Log all requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    path = request.url.path
    method = request.method
    logger.debug(f"Request: {method} {path}")
    
    try:
        response = await call_next(request)
        logger.debug(f"Response: {method} {path} - Status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request failed: {method} {path} - Error: {str(e)}")
        logger.error(traceback.format_exc())
        raise

# Error handler for all unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"}
    )

# Simple test endpoints that don't require database or blockchain
@app.get("/")
async def root():
    """Root endpoint to check if API is running"""
    return {"status": "success", "message": "Decentralized Voting API is running"}

@app.get("/api-test")
async def api_test():
    """Simple test endpoint that doesn't require authentication or database"""
    return {"status": "success", "message": "API test endpoint is working"}

@app.get("/test-db")
async def test_db():
    """Test database connection"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        cursor.close()
        connection.close()
        return {"status": "success", "message": "Database connection successful", "result": result}
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        logger.error(traceback.format_exc())
        return {"status": "failed", "error": str(e)}

@app.get("/test-eth")
async def test_eth():
    """Test Ethereum connection"""
    try:
        w3 = get_web3()
        block_number = w3.eth.block_number
        accounts = w3.eth.accounts
        return {
            "status": "success", 
            "message": "Ethereum connection successful", 
            "block_number": block_number,
            "accounts": accounts[:3]  # Show first 3 accounts
        }
    except Exception as e:
        logger.error(f"Ethereum connection test failed: {e}")
        logger.error(traceback.format_exc())
        return {"status": "failed", "error": str(e)}

@app.get("/test-contract")
async def test_contract():
    """Test contract connection"""
    try:
        settings = get_settings()
        contract_address = settings.VOTING_CONTRACT_ADDRESS
        
        # First check if we can load the contract
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        VOTING_JSON_PATH = os.path.join(BASE_DIR, "..", "build", "contracts", "Voting.json")
        
        contract_exists = os.path.exists(VOTING_JSON_PATH)
        if not contract_exists:
            return {
                "status": "failed", 
                "message": "Contract ABI file not found",
                "path_checked": VOTING_JSON_PATH
            }
        
        # Then check if we can connect to it
        w3 = get_web3()
        with open(VOTING_JSON_PATH, "r") as f:
            voting_artifact = json.load(f)
            
        # Check basic contract info without calling methods
        return {
            "status": "success",
            "message": "Contract info loaded",
            "contract_address": contract_address,
            "abi_length": len(voting_artifact["abi"]),
            "network_id": w3.net.version
        }
    except Exception as e:
        logger.error(f"Contract test failed: {e}")
        logger.error(traceback.format_exc())
        return {"status": "failed", "error": str(e)}

# Configuration and settings
class Settings:
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "014514774")
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "localhost")
    MYSQL_DB: str = os.getenv("MYSQL_DB", "voter_db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "62f1e84d08e6004fa753cf2dfa231d4b80e0e157c86f434e4eb518f21ad98dfe")
    REFRESH_SECRET_KEY: str = os.getenv("REFRESH_SECRET_KEY", os.getenv("SECRET_KEY") + "_refresh")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    ETHER_RPC_URL: str = os.getenv("ETHER_RPC_URL", "http://127.0.0.1:7545")
    VOTING_CONTRACT_ADDRESS: str = os.getenv("VOTING_CONTRACT_ADDRESS", "0xd223C26a57c51364Cbb8728984EE22744fAe7840")
    OWNER_ADDRESS: str = os.getenv("OWNER_ADDRESS", "")
    OWNER_PRIVATE_KEY: str = os.getenv("OWNER_PRIVATE_KEY", "")

@lru_cache()
def get_settings():
    return Settings()

def get_db_connection():
    settings = get_settings()
    try:
        logger.debug(f"Connecting to database: {settings.MYSQL_HOST}/{settings.MYSQL_DB} as {settings.MYSQL_USER}")
        connection = mysql.connector.connect(
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            host=settings.MYSQL_HOST,
            database=settings.MYSQL_DB,
            connection_timeout=5  # Add timeout to fail faster
        )
        logger.debug("Database connection successful")
        return connection
    except Error as err:
        logger.error(f"Failed to connect to database: {err}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(err)}")

@lru_cache()
def get_web3():
    settings = get_settings()
    logger.debug(f"Connecting to Ethereum node at {settings.ETHER_RPC_URL}")
    w3 = Web3(Web3.HTTPProvider(settings.ETHER_RPC_URL))
    if not w3.is_connected():
        logger.error("Failed to connect to Ethereum node")
        raise HTTPException(status_code=503, detail="Ethereum node connection failed")
    logger.debug("Ethereum node connection successful")
    return w3

def get_voting_contract():
    settings = get_settings()
    w3 = get_web3()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    VOTING_JSON_PATH = os.path.join(BASE_DIR, "..", "build", "contracts", "Voting.json")
    
    logger.debug(f"Loading contract ABI from {VOTING_JSON_PATH}")
    try:
        if not os.path.exists(VOTING_JSON_PATH):
            logger.error(f"Contract ABI file not found at {VOTING_JSON_PATH}")
            raise FileNotFoundError(f"Contract ABI file not found at {VOTING_JSON_PATH}")
            
        with open(VOTING_JSON_PATH, "r") as f:
            voting_artifact = json.load(f)
            
        contract = w3.eth.contract(address=settings.VOTING_CONTRACT_ADDRESS, abi=voting_artifact["abi"])
        logger.debug(f"Contract initialized at address {settings.VOTING_CONTRACT_ADDRESS}")
        return contract
    except Exception as e:
        logger.error(f"Error loading Voting contract: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to initialize contract: {str(e)}")

class VoterLogin(BaseModel):
    voter_id: str = Field(..., description="Ethereum address of the voter")
    password: str = Field(..., min_length=6)

class VoterRegister(BaseModel):
    voter_id: str = Field(..., description="Ethereum address of the voter")
    password: str = Field(..., min_length=6)
    role: str = Field("voter", description="User role (voter or admin)")
    
    @validator('role')
    def validate_role(cls, v):
        if v not in ['voter', 'admin']:
            raise ValueError('Role must be either "voter" or "admin"')
        return v
    
    @validator('voter_id')
    def validate_voter_id(cls, v):
        if not Web3.is_address(v):
            raise ValueError('Invalid Ethereum address')
        return v.lower()

class RefreshToken(BaseModel):
    refresh_token: str

class CandidateCreate(BaseModel):
    name: str = Field(..., min_length=1)
    party: str = Field(..., min_length=1)

class VotingDates(BaseModel):
    start_date: int = Field(..., gt=0)
    end_date: int = Field(..., gt=0)
    
    @validator('end_date')
    def validate_dates(cls, v, values):
        if v <= values.get('start_date', 0):
            raise ValueError('End date must be after start date')
        return v

class VoteRequest(BaseModel):
    candidate_id: int = Field(..., gt=0)

class Candidate(BaseModel):
    id: int
    name: str
    party: str
    vote_count: int

def get_db_cursor():
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        yield cursor, connection
    finally:
        cursor.close()
        connection.close()

async def authenticate(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        logger.warning("Authentication failed: No token provided")
        raise HTTPException(status_code=401, detail="No token provided", headers={"WWW-Authenticate": "Bearer"})
    
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if datetime.fromtimestamp(payload.get("exp", 0)) < datetime.now():
            logger.warning("Authentication failed: Token expired")
            raise HTTPException(status_code=401, detail="Token expired", headers={"WWW-Authenticate": "Bearer"})
        
        voter_id = payload.get("voter_id")
        role = payload.get("role", "voter")
        
        if not voter_id:
            logger.warning("Authentication failed: Invalid token (no voter_id)")
            raise HTTPException(status_code=401, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"})
        
        logger.debug(f"User authenticated: {voter_id}, role: {role}")
        return {"voter_id": voter_id, "role": role}
    except jwt.PyJWTError as e:
        logger.error(f"Token validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})

def require_admin(auth_data: dict = Depends(authenticate)):
    if auth_data.get("role") != "admin":
        logger.warning(f"Admin access denied for user: {auth_data.get('voter_id')}")
        raise HTTPException(status_code=403, detail="Admin rights required")
    return auth_data

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# Fixed verify_password function
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Make sure we're using UTF-8 encoding
        plain_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        
        # Validate the format before checking
        if not hashed_bytes.startswith(b'$2'):
            logger.error(f"Invalid password hash format: does not start with $2")
            return False
            
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except ValueError as val_err:
        logger.error(f"Invalid salt or password format: {val_err}")
        return False
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        logger.error(traceback.format_exc())
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire.timestamp()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

def create_refresh_token(data: dict):
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire.timestamp()})
    return jwt.encode(to_encode, settings.REFRESH_SECRET_KEY, algorithm="HS256")

@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(voter: VoterRegister, db=Depends(get_db_cursor)):
    cursor, conn = db
    try:
        logger.info(f"Registration attempt for voter_id: {voter.voter_id}")
        voter_id = Web3.to_checksum_address(voter.voter_id)
        
        cursor.execute("SELECT voter_id FROM voters WHERE voter_id = %s", (voter_id,))
        if cursor.fetchone():
            logger.warning(f"Registration failed: Voter ID already exists - {voter_id}")
            raise HTTPException(status_code=400, detail="Voter ID already exists")
        
        hashed_pwd = hash_password(voter.password)
        cursor.execute(
            "INSERT INTO voters (voter_id, password_hash, role, created_at) VALUES (%s, %s, %s, NOW())",
            (voter_id, hashed_pwd, voter.role)
        )
        conn.commit()
        logger.info(f"Registration successful for voter_id: {voter_id}, role: {voter.role}")
        return {"message": "Voter registered successfully"}
    except Error as e:
        conn.rollback()
        logger.error(f"Database error during registration: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/login", status_code=status.HTTP_200_OK)
async def login(voter: VoterLogin, db=Depends(get_db_cursor)):
    cursor, conn = db
    try:
        logger.info(f"Login attempt for voter_id: {voter.voter_id}")
        try:
            voter_id = Web3.to_checksum_address(voter.voter_id)
        except Exception as e:
            logger.warning(f"Invalid Ethereum address format: {voter.voter_id}")
            raise HTTPException(status_code=400, detail="Invalid Ethereum address format")
        
        # Query for the user
        try:
            cursor.execute("SELECT password_hash, role FROM voters WHERE voter_id = %s", (voter_id,))
            result = cursor.fetchone()
        except Exception as db_err:
            logger.error(f"Database query error: {db_err}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")
        
        if not result:
            logger.warning(f"Login failed: Voter ID not found - {voter_id}")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password with more robust error handling
        try:
            password_correct = verify_password(voter.password, result["password_hash"])
            if not password_correct:
                logger.warning(f"Login failed: Incorrect password for voter_id - {voter_id}")
                raise HTTPException(status_code=401, detail="Invalid credentials")
        except Exception as pwd_err:
            logger.error(f"Password verification error: {pwd_err}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail="Authentication error")
        
        role = result["role"]
        token_data = {"voter_id": voter_id, "role": role}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        # Log the successful login
        try:
            cursor.execute(
                "INSERT INTO login_history (voter_id, login_time, success) VALUES (%s, NOW(), %s)",
                (voter_id, True)
            )
            conn.commit()
        except Exception as log_err:
            logger.error(f"Failed to log login: {log_err}")
            # Don't fail the login just because we couldn't log it
        
        logger.info(f"Login successful for voter_id: {voter_id}, role: {role}")
        return {"token": access_token, "refresh_token": refresh_token, "role": role}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error during login: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Login failed due to server error")

@app.post("/refresh", status_code=status.HTTP_200_OK)
async def refresh_token_endpoint(refresh: RefreshToken, db=Depends(get_db_cursor)):
    settings = get_settings()
    try:
        logger.info("Token refresh attempt")
        payload = jwt.decode(refresh.refresh_token, settings.REFRESH_SECRET_KEY, algorithms=["HS256"])
        if datetime.fromtimestamp(payload.get("exp", 0)) < datetime.now():
            logger.warning("Token refresh failed: Refresh token expired")
            raise HTTPException(status_code=401, detail="Refresh token expired")
        
        voter_id = payload.get("voter_id")
        role = payload.get("role", "voter")
        
        cursor, conn = db
        cursor.execute("SELECT role FROM voters WHERE voter_id = %s", (voter_id,))
        result = cursor.fetchone()
        if not result or result["role"] != role:
            logger.warning(f"Token refresh failed: Invalid refresh token for voter_id - {voter_id}")
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        token_data = {"voter_id": voter_id, "role": role}
        access_token = create_access_token(token_data)
        new_refresh_token = create_refresh_token(token_data)
        
        logger.info(f"Token refresh successful for voter_id: {voter_id}")
        return {"token": access_token, "refresh_token": new_refresh_token}
    except jwt.PyJWTError as e:
        logger.error(f"Refresh token validation failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=401, detail=f"Invalid refresh token: {str(e)}")

@app.get("/voter/status", status_code=status.HTTP_200_OK)
async def get_voter_status(auth_data: dict = Depends(authenticate)):
    try:
        voter_id = Web3.to_checksum_address(auth_data["voter_id"])
        logger.info(f"Checking voter status for: {voter_id}")
        
        voting_contract = get_voting_contract()
        has_voted = voting_contract.functions.hasVoted(voter_id).call()
        voting_status = voting_contract.functions.getVotingStatus().call()
        status_map = {0: "not_started", 1: "active", 2: "ended"}
        
        logger.info(f"Voter status retrieved for {voter_id}: has_voted={has_voted}, status={status_map.get(voting_status, 'unknown')}")
        return {
            "voter_id": voter_id,
            "has_voted": has_voted,
            "voting_status": status_map.get(voting_status, "unknown")
        }
    except Exception as e:
        logger.error(f"Error checking voter status: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to check voter status: {str(e)}")

@app.get("/voting/dates", status_code=status.HTTP_200_OK)
async def get_voting_dates():
    try:
        logger.info("Fetching voting dates")
        voting_contract = get_voting_contract()
        try:
            start, end = voting_contract.functions.getVotingPeriod().call()
            start_readable = datetime.fromtimestamp(start).isoformat() if start > 0 else None
            end_readable = datetime.fromtimestamp(end).isoformat() if end > 0 else None
            
            logger.info(f"Voting dates retrieved: start={start_readable}, end={end_readable}")
            return {
                "start_date": start,
                "end_date": end,
                "start_date_iso": start_readable,
                "end_date_iso": end_readable
            }
        except Exception as contract_error:
            logger.error(f"Contract error when fetching voting dates: {contract_error}")
            logger.error(traceback.format_exc())
            # Provide default values for development
            current_time = datetime.now()
            return {
                "start_date": int(current_time.timestamp()),
                "end_date": int((current_time + timedelta(days=7)).timestamp()),
                "start_date_iso": current_time.isoformat(),
                "end_date_iso": (current_time + timedelta(days=7)).isoformat(),
                "note": "These are default values. Contract error: " + str(contract_error)
            }
    except Exception as e:
        logger.error(f"Error fetching voting dates: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch voting dates: {str(e)}")

@app.get("/candidates", response_model=List[Candidate])
async def get_candidates():
    try:
        logger.info("Fetching candidates")
        voting_contract = get_voting_contract()
        try:
            candidates_data = voting_contract.functions.getAllCandidates().call()
            
            candidates = [
                {"id": c[0], "name": c[1], "party": c[2], "vote_count": c[3]}
                for c in candidates_data
            ]
            
            logger.info(f"Retrieved {len(candidates)} candidates")
            return candidates
        except Exception as contract_error:
            logger.error(f"Contract error when fetching candidates: {contract_error}")
            logger.error(traceback.format_exc())
            # Return sample data for development
            return [
                {"id": 1, "name": "Sample Candidate 1", "party": "Party A", "vote_count": 5},
                {"id": 2, "name": "Sample Candidate 2", "party": "Party B", "vote_count": 3}
            ]
    except Exception as e:
        logger.error(f"Error fetching candidates: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch candidates: {str(e)}")

@app.post("/vote", status_code=status.HTTP_201_CREATED)
async def submit_vote(vote: VoteRequest, auth_data: dict = Depends(authenticate)):
    settings = get_settings()
    w3 = get_web3()
    try:
        voter_id = Web3.to_checksum_address(auth_data["voter_id"])
        logger.info(f"Vote attempt from {voter_id} for candidate {vote.candidate_id}")
        
        voting_contract = get_voting_contract()
        
        # Check if already voted
        try:
            if voting_contract.functions.hasVoted(voter_id).call():
                logger.warning(f"Vote failed: {voter_id} has already voted")
                raise HTTPException(status_code=400, detail="Already voted")
        except Exception as contract_error:
            logger.error(f"Contract error when checking vote status: {contract_error}")
            logger.error(traceback.format_exc())
            # For development, allow vote anyway
            pass
        
        try:
            tx = voting_contract.functions.vote(vote.candidate_id).build_transaction({
                'from': settings.OWNER_ADDRESS or voter_id,
                'nonce': w3.eth.get_transaction_count(settings.OWNER_ADDRESS or voter_id),
                'gas': 200000,
                'gasPrice': w3.eth.gas_price
            })
            
            # In production, this should be signed by the client
            signed_tx = w3.eth.account.sign_transaction(tx, settings.OWNER_PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            logger.info(f"Vote successfully recorded for {voter_id}, tx_hash: {tx_hash.hex()}")
            return {"transaction_hash": tx_hash.hex(), "message": "Vote recorded"}
        except Exception as contract_error:
            logger.error(f"Contract error when submitting vote: {contract_error}")
            logger.error(traceback.format_exc())
            # For development, simulate success
            return {"transaction_hash": "0x" + "0" * 64, "message": "Vote simulated (contract error occurred)"}
    except Exception as e:
        logger.error(f"Error submitting vote: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to submit vote: {str(e)}")

@app.post("/candidates", status_code=status.HTTP_201_CREATED)
async def add_candidate(candidate: CandidateCreate, auth_data: dict = Depends(require_admin)):
    settings = get_settings()
    w3 = get_web3()
    try:
        logger.info(f"Adding candidate: {candidate.name} ({candidate.party}) by admin: {auth_data['voter_id']}")
        
        voting_contract = get_voting_contract()
        try:
            tx = voting_contract.functions.addCandidate(candidate.name, candidate.party).build_transaction({
                'from': settings.OWNER_ADDRESS,
                'nonce': w3.eth.get_transaction_count(settings.OWNER_ADDRESS),
                'gas': 200000,
                'gasPrice': w3.eth.gas_price
            })
            signed_tx = w3.eth.account.sign_transaction(tx, settings.OWNER_PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            logger.info(f"Candidate {candidate.name} added successfully, tx_hash: {tx_hash.hex()}")
            return {"transaction_hash": tx_hash.hex(), "message": "Candidate added"}
        except Exception as contract_error:
            logger.error(f"Contract error when adding candidate: {contract_error}")
            logger.error(traceback.format_exc())
            # For development, simulate success
            return {"transaction_hash": "0x" + "0" * 64, "message": "Candidate addition simulated (contract error occurred)"}
    except Exception as e:
        logger.error(f"Error adding candidate: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to add candidate: {str(e)}")

@app.post("/voting/set-dates", status_code=status.HTTP_200_OK)
async def set_voting_dates(dates: VotingDates, auth_data: dict = Depends(require_admin)):
    settings = get_settings()
    w3 = get_web3()
    try:
        start_date_str = datetime.fromtimestamp(dates.start_date).isoformat()
        end_date_str = datetime.fromtimestamp(dates.end_date).isoformat()
        logger.info(f"Setting voting dates: {start_date_str} to {end_date_str} by admin: {auth_data['voter_id']}")
        
        voting_contract = get_voting_contract()
        try:
            tx = voting_contract.functions.setVotingPeriod(dates.start_date, dates.end_date).build_transaction({
                'from': settings.OWNER_ADDRESS,
                'nonce': w3.eth.get_transaction_count(settings.OWNER_ADDRESS),
                'gas': 200000,
                'gasPrice': w3.eth.gas_price
            })
            signed_tx = w3.eth.account.sign_transaction(tx, settings.OWNER_PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            logger.info(f"Voting dates set successfully, tx_hash: {tx_hash.hex()}")
            return {"transaction_hash": tx_hash.hex(), "message": "Voting dates set"}
        except Exception as contract_error:
            logger.error(f"Contract error when setting voting dates: {contract_error}")
            logger.error(traceback.format_exc())
            # For development, simulate success
            return {"transaction_hash": "0x" + "0" * 64, "message": "Voting dates setting simulated (contract error occurred)"}
    except Exception as e:
        logger.error(f"Error setting voting dates: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to set voting dates: {str(e)}")

@app.post("/voting/update-dates", status_code=status.HTTP_200_OK)
async def update_voting_dates(dates: VotingDates, auth_data: dict = Depends(require_admin)):
    settings = get_settings()
    w3 = get_web3()
    try:
        start_date_str = datetime.fromtimestamp(dates.start_date).isoformat()
        end_date_str = datetime.fromtimestamp(dates.end_date).isoformat()
        logger.info(f"Updating voting dates: {start_date_str} to {end_date_str} by admin: {auth_data['voter_id']}")
        
        voting_contract = get_voting_contract()
        try:
            tx = voting_contract.functions.setVotingPeriod(dates.start_date, dates.end_date).build_transaction({
                'from': settings.OWNER_ADDRESS,
                'nonce': w3.eth.get_transaction_count(settings.OWNER_ADDRESS),
                'gas': 200000,
                'gasPrice': w3.eth.gas_price
            })
            signed_tx = w3.eth.account.sign_transaction(tx, settings.OWNER_PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            logger.info(f"Voting dates updated successfully, tx_hash: {tx_hash.hex()}")
            return {"transaction_hash": tx_hash.hex(), "message": "Voting dates updated"}
        except Exception as contract_error:
            logger.error(f"Contract error when updating voting dates: {contract_error}")
            logger.error(traceback.format_exc())
            # For development, simulate success
            return {"transaction_hash": "0x" + "0" * 64, "message": "Voting dates updating simulated (contract error occurred)"}
    except Exception as e:
        logger.error(f"Error updating voting dates: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to update voting dates: {str(e)}")

@app.post("/logout", status_code=status.HTTP_200_OK)
async def logout(auth_data: dict = Depends(authenticate), db=Depends(get_db_cursor)):
    cursor, conn = db
    try:
        voter_id = auth_data["voter_id"]
        logger.info(f"Logout request for user: {voter_id}")
        
        cursor.execute(
            "INSERT INTO login_history (voter_id, login_time, success) VALUES (%s, NOW(), %s)",
            (voter_id, False)
        )
        conn.commit()
        
        logger.info(f"Logout successful for user: {voter_id}")
        return {"message": "Logged out successfully"}
    except Error as e:
        logger.error(f"Database error during logout: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")

# Explicitly handle OPTIONS requests for CORS preflight
@app.options("/{path:path}")
async def options_handler(path: str):
    return {}

# Add a test login endpoint for debugging
@app.post("/test-login")
async def test_login(voter: VoterLogin):
    """Test login function without database dependencies"""
    logger.info(f"Test login attempt for voter_id: {voter.voter_id}")
    voter_id = Web3.to_checksum_address(voter.voter_id)
    
    # Return success for test purposes
    return {
        "token": "test_token",
        "refresh_token": "test_refresh_token",
        "role": "admin"
    }

if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 (all interfaces) instead of just 127.0.0.1 for better network access
    logger.info("Starting FastAPI server on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)