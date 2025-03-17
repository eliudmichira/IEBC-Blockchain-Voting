# setup_db.py
import mysql.connector
import bcrypt
import os
from dotenv import load_dotenv
import sys
from web3 import Web3

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'user': os.getenv("MYSQL_USER", "root"),
    'password': os.getenv("MYSQL_PASSWORD", "014514774"),
    'host': os.getenv("MYSQL_HOST", "localhost"),
}

DB_NAME = os.getenv("MYSQL_DB", "voter_db")

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def setup_database():
    # Connect to MySQL
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Create database if it doesn't exist
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
    print(f"Database '{DB_NAME}' created or already exists")
    
    # Use the database
    cursor.execute(f"USE {DB_NAME}")
    
    # Create voters table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS voters (
        voter_id VARCHAR(42) PRIMARY KEY,
        password_hash VARCHAR(100) NOT NULL,
        role ENUM('voter', 'admin') DEFAULT 'voter',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    print("Table 'voters' created or already exists")
    
    # Create login_history table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS login_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        voter_id VARCHAR(42) NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT TRUE
    )
    """)
    print("Table 'login_history' created or already exists")
    
    # Insert admin user if it doesn't exist
    admin_address = "0x577a71aeae2C21d56b0c99D1e7c568fCC2391587"
    admin_password = "ADMIN123"
    
    # Convert to checksum address
    admin_address = Web3.to_checksum_address(admin_address)
    
    # Check if admin exists
    cursor.execute("SELECT voter_id FROM voters WHERE voter_id = %s", (admin_address,))
    admin_record = cursor.fetchone()
    
    if not admin_record:
        # Create admin user
        hashed_pwd = hash_password(admin_password)
        cursor.execute(
            "INSERT INTO voters (voter_id, password_hash, role) VALUES (%s, %s, %s)",
            (admin_address, hashed_pwd, "admin")
        )
        print(f"Admin user with address {admin_address} created")
    else:
        # Update admin user password to ensure it's correct
        hashed_pwd = hash_password(admin_password)
        cursor.execute(
            "UPDATE voters SET password_hash = %s WHERE voter_id = %s",
            (hashed_pwd, admin_address)
        )
        print(f"Admin user with address {admin_address} updated with new password hash")
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print("Database setup completed successfully")

if __name__ == "__main__":
    setup_database()