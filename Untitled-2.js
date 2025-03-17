document.addEventListener("DOMContentLoaded", async () => {
    let provider;
    let signer;
    let votingContract;
    const API_URL = "http://localhost:8000";
    const CONTRACT_ADDRESS = "0xd223C26a57c51364Cbb8728984EE22744fAe7840"; // Ensure this is the correct contract address

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const voterId = localStorage.getItem("voterId");
    
    if (!token || !voterId) {
        window.location.href = "login.html";
        return;
    }

    // Initialize Ethers.js
    async function initEthers() {
        if (window.ethereum) {
            try {
                provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
                signer = await provider.getSigner();
                console.log("Connected to account:", await signer.getAddress());
                return true;
            } catch (error) {
                console.error("MetaMask connection error:", error);
                showFeedback("MetaMask connection failed. Please ensure MetaMask is unlocked and try again.");
                return false;
            }
        } else {
            console.error("MetaMask not available");
            showFeedback("Please install MetaMask to use this application.");
            return false;
        }
    }

    // Load Voting contract ABI
    async function initContract() {
        try {
            const response = await fetch("../build/contracts/Voting.json");
            const artifact = await response.json();
            votingContract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, signer);
            
            // Validate the contract upon initialization
            const isValid = await validateContract();
            if (!isValid) {
                showFeedback("Failed to validate contract. Check contract address or network.", "contractFeedback");
                return false;
            }
            return true;
        } catch (error) {
            console.error("Failed to initialize contract:", error);
            showFeedback("Failed to load contract data. Please check your connection and refresh the page.", "contractFeedback");
            return false;
        }
    }

    // Check if the current user is the admin
    async function verifyAdminStatus() {
        try {
            const adminAddress = await votingContract.admin();
            const currentAddress = await signer.getAddress();
            console.log("Admin address:", adminAddress);
            console.log("Current address:", currentAddress);
            
            if (adminAddress.toLowerCase() !== currentAddress.toLowerCase()) {
                showFeedback("Warning: You are not the admin of this contract. Some functions may not work.", "adminStatusFeedback");
                return false;
            }
            return true;
        } catch (error) {
            console.error("Failed to verify admin status:", error);
            showFeedback("Failed to verify admin status. Contract may be unavailable.", "adminStatusFeedback");
            return false;
        }
    }
    // Add this right after connecting to your contract to verify you're the admin
    async function checkAdminStatus() {
        try {
            const adminAddress = await votingContract.admin();
            const currentAddress = await signer.getAddress();
            console.log("Admin address:", adminAddress);
            console.log("Current address:", currentAddress);
            
            if (adminAddress.toLowerCase() !== currentAddress.toLowerCase()) {
              alert("Warning: You are not the admin of this contract. Some functions may not work.");
            }
        } catch (error) {
            console.error("Failed to check admin status:", error);
        }
    }
    // Quick Contract Verification
    async function verifyContractState() {
        try {
            // Check voting dates - a simple view function that should work
            const [start, end] = await votingContract.getVotingDates();
            console.log("Voting dates:", new Date(start * 1000), new Date(end * 1000));
            
            // Check contract owner
            const owner = await votingContract.admin();
            console.log("Contract admin:", owner);
            
            // Log your current address
            const currentAddress = await signer.getAddress();
            console.log("Your address:", currentAddress);
            
            return true;
        } catch (error) {
            console.error("Contract state verification failed:", error);
            alert("There's an issue with the contract. Please check that you're on the right network and using the correct account.");
            return false;
        }
    }

    // Add a quick validation function
    async function validateContract() {
        try {
            // Try to call a simple view function that should always work
            const adminAddress = await votingContract.admin();
            return true;
        } catch (error) {
            console.error("Contract validation failed:", error);
            return false;
        }
    }

    // Safer way to call contract functions
    async function safeContractCall(func, ...args) {
        try {
            const functionName = func.name || "unknown function";
            console.log(`Calling ${functionName} with args:`, args);
            
            // Handle write functions (transactions)
            if (func.estimateGas) {
                try {
                    const gasEstimate = await func.estimateGas(...args);
                    console.log(`Gas estimate: ${gasEstimate.toString()}`);
                    
                    // Add 20% buffer to gas estimate
                    const gasLimit = BigInt(Math.floor(Number(gasEstimate) * 1.2));
                    
                    const tx = await func(...args, { gasLimit });
                    showFeedback(`Transaction sent. Waiting for confirmation...`, "transactionFeedback");
                    
                    const receipt = await tx.wait();
                    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
                    return receipt;
                } catch (error) {
                    console.error(`Gas estimation failed for ${functionName}:`, error);
                    throw new Error(`Transaction would fail: ${error.message}`);
                }
            } else {
                // For read functions (calls)
                return await func(...args);
            }
        } catch (error) {
            console.error(`Failed to call contract function:`, error);
            throw error;
        }
    }

    function showFeedback(message, targetId = "feedback") {
        const feedback = document.getElementById(targetId);
        if (feedback) {
            feedback.textContent = message;
            feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    async function loadCandidates() {
        try {
            // Get candidate count
            const count = await safeContractCall(votingContract.getCandidateCount);
            console.log(`Found ${count} candidates`);
            
            const candidates = [];
            // Loop through each candidate
            for (let i = 1; i <= count; i++) {
                try {
                    const [id, name, party, voteCount] = await safeContractCall(votingContract.getCandidate, i);
                    candidates.push({
                        id: id.toString(),
                        name,
                        party,
                        voteCount: voteCount.toString()
                    });
                } catch (error) {
                    console.error(`Error loading candidate ${i}:`, error);
                }
            }
            
            // Display candidates in the UI
            displayCandidates(candidates);
            return candidates;
        } catch (error) {
            console.error("Failed to load candidates:", error);
            showFeedback("Failed to load candidates. Please check your connection and try again.", "candidatesFeedback");
            return [];
        }
    }

    function displayCandidates(candidates) {
        const candidatesList = document.getElementById("candidatesList");
        if (!candidatesList) return;
        
        candidatesList.innerHTML = "";
        
        if (candidates.length === 0) {
            candidatesList.innerHTML = `<tr><td colspan="4" class="p-3 text-center">No candidates found</td></tr>`;
            return;
        }
        
        candidates.forEach(candidate => {
            candidatesList.innerHTML += `
                <tr>
                    <td class="p-3 border border-gray-600">${candidate.id}</td>
                    <td class="p-3 border border-gray-600">${candidate.name}</td>
                    <td class="p-3 border border-gray-600">${candidate.party}</td>
                    <td class="p-3 border border-gray-600">${candidate.voteCount}</td>
                </tr>
            `;
        });
    }

    async function loadVotingDates() {
        try {
            const [start, end] = await safeContractCall(votingContract.getVotingDates);
            
            if (start > 0 && end > 0) {
                const startDate = new Date(Number(start) * 1000).toLocaleString();
                const endDate = new Date(Number(end) * 1000).toLocaleString();
                document.getElementById("votingDatesDisplay").textContent = `${startDate} - ${endDate}`;
            } else {
                document.getElementById("votingDatesDisplay").textContent = "Not set";
            }
        } catch (error) {
            console.error("Failed to load voting dates:", error);
            document.getElementById("votingDatesDisplay").textContent = "Failed to load dates";
        }
    }

    async function addCandidate(name, party) {
        try {
            // First verify admin status
            const isAdmin = await verifyAdminStatus();
            if (!isAdmin) {
                showFeedback("You must be the admin to add candidates.", "candidateFeedback");
                return false;
            }
            
            // Then add the candidate
            await safeContractCall(votingContract.addCandidate, String(name), String(party));
            showFeedback("Candidate added successfully!", "candidateFeedback");
            
            // Refresh the candidates list
            await loadCandidates();
            return true;
        } catch (error) {
            console.error("Error adding candidate:", error);
            showFeedback(`Error adding candidate: ${error.message}`, "candidateFeedback");
            return false;
        }
    }

    async function setVotingDates(startDate, endDate) {
        try {
            // First verify admin status
            const isAdmin = await verifyAdminStatus();
            if (!isAdmin) {
                showFeedback("You must be the admin to set voting dates.", "datesFeedback");
                return false;
            }
            
            // Convert dates to Unix timestamps
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
            
            // Validate dates
            if (startTimestamp <= Math.floor(Date.now() / 1000)) {
                showFeedback("Start date must be in the future.", "datesFeedback");
                return false;
            }
            
            if (endTimestamp <= startTimestamp) {
                showFeedback("End date must be after start date.", "datesFeedback");
                return false;
            }
            
            // Set the dates
            await safeContractCall(votingContract.setVotingDates, startTimestamp, endTimestamp);
            showFeedback("Voting dates set successfully!", "datesFeedback");
            
            // Refresh the dates display
            await loadVotingDates();
            return true;
        } catch (error) {
            console.error("Error setting voting dates:", error);
            showFeedback(`Error setting voting dates: ${error.message}`, "datesFeedback");
            return false;
        }
    }

    async function initApp() {
        // First initialize ethers and the contract
        const ethersInitialized = await initEthers();
        if (!ethersInitialized) return;
        
        const contractInitialized = await initContract();
        if (!contractInitialized) return;
        
        // Check admin status
        await checkAdminStatus(); // Added checkAdminStatus
        await verifyAdminStatus(); //Keep verifyAdminStatus
        await verifyContractState(); //Added verifyContractState
        
        // Load data
        await loadVotingDates();
        await loadCandidates();
        
        // Set up event listeners for forms
        const addCandidateForm = document.getElementById("addCandidateForm");
        if (addCandidateForm) {
            addCandidateForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const name = document.getElementById("name").value.trim();
                const party = document.getElementById("party").value.trim();
                
                if (!name) {
                    showFeedback("Candidate name is required.", "candidateFeedback");
                    return;
                }
                
                if (!party) {
                    showFeedback("Party name is required.", "candidateFeedback");
                    return;
                }
                
                const success = await addCandidate(name, party);
                if (success) {
                    addCandidateForm.reset();
                }
            });
        }
        
        const setDatesForm = document.getElementById("setDatesForm");
        if (setDatesForm) {
            setDatesForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const startDate = document.getElementById("startDate").value;
                const endDate = document.getElementById("endDate").value;
                
                if (!startDate) {
                    showFeedback("Start date is required.", "datesFeedback");
                    return;
                }
                
                if (!endDate) {
                    showFeedback("End date is required.", "datesFeedback");
                    return;
                }
                
                const success = await setVotingDates(startDate, endDate);
                if (success) {
                    setDatesForm.reset();
                }
            });
        }
        
        const refreshButton = document.getElementById("refreshButton");
        if (refreshButton) {
            refreshButton.addEventListener("click", async () => {
                refreshButton.disabled = true;
                await loadCandidates();
                await loadVotingDates();
                refreshButton.disabled = false;
            });
        }
    }
    
    // Bootstrap the application
    initApp();
});
