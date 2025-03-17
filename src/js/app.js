document.addEventListener("DOMContentLoaded", async () => {
    // State variables
    let provider;
    let signer;
    let votingContract;
    let API_URL = '/proxy'; // Default to proxy
    
    const CONTRACT_ADDRESS = "0xa95f9E532a1Cd51fD03052A8E5f04528287f8fca";

    // Authentication data
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const voterId = localStorage.getItem("voterId");
    
    // If not logged in, redirect to login page
    if (!token || !voterId) {
        window.location.href = "login.html";
        return;
    }

    // Helper for network requests with improved token handling
    async function makeApiRequest(endpoint, method = 'GET', data = null, retryCount = 0) {
        // Get the most current token
        const currentToken = localStorage.getItem('token');
        const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            mode: 'cors',
            credentials: 'same-origin'
        };
        
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            options.body = JSON.stringify(data);
        }
        
        console.log(`Making ${method} request to ${url}`);
        
        try {
            const response = await fetch(url, options);
            
            // Log response headers for debugging
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            console.log("Response headers:", responseHeaders);
            
            // Handle unauthorized responses directly
            if (response.status === 401) {
                console.log("Received 401 Unauthorized, attempting token refresh");
                // Maximum retry to prevent infinite loops
                if (retryCount >= 2) {
                    console.error("Maximum retries reached for token refresh");
                    await logout(true);
                    throw new Error("Session expired. Please login again.");
                }
                
                const refreshSuccess = await refreshToken();
                if (refreshSuccess) {
                    console.log("Token refreshed successfully, retrying original request");
                    // Retry the original request with the new token
                    return makeApiRequest(endpoint, method, data, retryCount + 1);
                } else {
                    console.error("Token refresh failed");
                    await logout(true);
                    throw new Error("Authentication failed. Please login again.");
                }
            }
            
            // Try to parse as JSON
            let result;
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.log("Received non-JSON response:", text.substring(0, 100) + (text.length > 100 ? '...' : ''));
                
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    if (text.includes('<!DOCTYPE html>')) {
                        throw new Error("Received HTML instead of JSON. API server may be misconfigured.");
                    }
                    result = { message: text };
                }
            }
            
            if (!response.ok) {
                throw new Error(result.detail || result.message || `Request failed with status ${response.status}`);
            }
            
            return result;
        } catch (error) {
            // Handle other auth-related errors that might not result in a 401 status
            if (error.message.includes('token') && error.message.includes('invalid') && retryCount < 2) {
                console.log("Token-related error detected, attempting refresh");
                const refreshSuccess = await refreshToken();
                if (refreshSuccess) {
                    return makeApiRequest(endpoint, method, data, retryCount + 1);
                }
            }
            
            console.error("API request failed:", error);
            throw error;
        }
    }
    
    // Enhanced token refresh logic with improved error handling
    async function refreshToken() {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
            console.error("No refresh token available");
            return false;
        }
        
        console.log("Attempting to refresh access token");
        
        try {
            // Use a different instance of fetch to avoid recursive calls to makeApiRequest
            const response = await fetch(`${API_URL}/refresh`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Include the current tokens in case the server needs them for validation
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ refresh_token: refreshToken }),
                mode: 'cors',
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Token refresh failed with status ${response.status}:`, errorText);
                return false;
            }
            
            let data;
            try {
                data = await response.json();
            } catch (e) {
                console.error("Failed to parse refresh token response:", e);
                return false;
            }
            
            if (!data.token) {
                console.error("Refresh response did not contain a new token");
                return false;
            }
            
            console.log("Token refreshed successfully");
            
            // Store the new tokens
            localStorage.setItem('token', data.token);
            
            // If a new refresh token is provided, update it as well
            if (data.refresh_token) {
                localStorage.setItem('refreshToken', data.refresh_token);
            }
            
            return true;
        } catch (error) {
            console.error("Token refresh request failed:", error);
            return false;
        }
    }
    
    // Enhanced logout function with proper cleanup and error handling
    async function logout(skipApiCall = false) {
        debugLog("Initiating logout process");
        
        try {
            // Get tokens before clearing them
            const currentToken = localStorage.getItem("token");
            
            // Clear all auth data first to prevent further authenticated requests
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("voterId");
            localStorage.removeItem("role");
            sessionStorage.clear();
            
            // Clear authentication cookies
            document.cookie.split(";").forEach(cookie => {
                const [name] = cookie.trim().split("=");
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            });
            
            // Only make API logout call if we have a token and skipApiCall is false
            if (currentToken && !skipApiCall) {
                try {
                    await fetch(`${API_URL}/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentToken}`
                        },
                        mode: 'cors',
                        credentials: 'same-origin'
                    });
                    debugLog("API logout successful");
                } catch (error) {
                    debugLog("API logout error:", error);
                    // Continue with client-side logout regardless of API error
                }
            }
            
            // Disconnect from blockchain if connected
            if (provider) {
                try {
                    provider = null;
                    signer = null;
                    votingContract = null;
                    debugLog("Blockchain connection cleared");
                } catch (error) {
                    debugLog("Error clearing blockchain connection:", error);
                }
            }
            
            // Delay redirect slightly to allow for cleanup
            setTimeout(() => {
                debugLog("Redirecting to login page");
                window.location.href = "login.html";
            }, 100);
            
        } catch (error) {
            debugLog("Logout error:", error);
            // Force redirect on error to ensure user is logged out
            window.location.href = "login.html";
        }
    }

    // Initialize Ethers.js
    async function initEthers() {
        if (!window.ethereum) {
            showFeedback("MetaMask not installed. Please install MetaMask to use this application.", true);
            return false;
        }
        
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            await window.ethereum.request({ method: "eth_requestAccounts" });
            signer = await provider.getSigner();
            return true;
        } catch (error) {
            console.error("MetaMask connection error:", error);
            showFeedback("MetaMask connection failed: " + error.message, true);
            return false;
        }
    }

    // Add contract state tracking
    let contractState = {
        initialized: false,
        error: null,
        initializationAttempts: 0,
        maxAttempts: 3
    };

    // Enhanced contract initialization with retries
    async function initContract() {
        try {
            contractState.initializationAttempts++;
            console.log(`Attempting to initialize contract (Attempt ${contractState.initializationAttempts}/${contractState.maxAttempts})`);

            if (!signer) {
                throw new Error("Signer not initialized. Please connect your wallet first.");
            }

            const response = await fetch("/build/contracts/Voting.json");
            if (!response.ok) {
                throw new Error(`Failed to load contract ABI: ${response.statusText}`);
            }
            
            const artifact = await response.json();
            votingContract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, signer);
            
            // Verify contract connection
            await votingContract.hasVoted(voterId);
            
            contractState.initialized = true;
            console.log("Contract initialized successfully");
            return votingContract;
        } catch (error) {
            console.error("Contract initialization error:", error);
            contractState.error = error;

            if (contractState.initializationAttempts < contractState.maxAttempts) {
                console.log("Retrying contract initialization...");
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
                return initContract();
            }

            showFeedback("Failed to initialize voting contract: " + error.message, true);
            throw error;
        }
    }

    // Contract state checker
    function ensureContract() {
        if (!votingContract || !contractState.initialized) {
            throw new Error("Voting contract not properly initialized. Please refresh the page and try again.");
        }
    }

    // Safe contract call with fallback and error handling
    async function safeContractCall(contractFn, fallbackValue = null, errorMessage = "Contract operation failed") {
        try {
            return await contractFn();
        } catch (error) {
            console.error(errorMessage, error);
            
            // Check for specific error types for better user messages
            if (error.message.includes("AlreadyVoted")) {
                throw new Error("You have already voted");
            } else if (error.message.includes("VotingNotActive")) {
                throw new Error("Voting is not currently active");
            } else if (error.message.includes("InvalidCandidate")) {
                throw new Error("Invalid candidate selection");
            } else if (error.message.includes("user denied")) {
                throw new Error("Transaction rejected. Please confirm in MetaMask.");
            }
            
            if (fallbackValue !== null) {
                return fallbackValue;
            }
            throw new Error(errorMessage + ": " + error.message);
        }
    }

    // Show feedback to the user
    function showFeedback(message, isError = false, targetId = "feedback") {
        const feedback = document.getElementById(targetId);
        if (!feedback) return;
        
        const container = feedback.closest('[id$="FeedbackContainer"]') || feedback.parentElement;
        if (container) {
            container.classList.remove("hidden", "bg-green-800", "bg-red-800", "dark:bg-green-800", "dark:bg-red-800");
            container.classList.add(isError ? "bg-red-800" : "bg-green-800");
            if (document.documentElement.classList.contains("dark")) {
                container.classList.add(isError ? "dark:bg-red-800" : "dark:bg-green-800");
            }
        }
        
        feedback.textContent = message;
        feedback.className = "text-white";
        
        if (container && !isError) {
            setTimeout(() => {
                container.classList.add("hidden");
            }, 5000);
        }
    }

    // Set element loading state
    function setLoading(element, isLoading, loadingText = "Loading...", originalText = null) {
        if (!element) return;
        
        if (isLoading) {
            element._originalText = element.innerHTML;
            element.disabled = true;
            element.innerHTML = `<span class="loader"></span><span>${loadingText}</span>`;
        } else {
            element.disabled = false;
            element.innerHTML = originalText || element._originalText || "Ready";
        }
    }
    
    // Enhanced API connection testing with fallback handling
    async function testApiConnection() {
        // Store original console methods
        const originalConsole = { ...console };
        let apiStatus = {
            direct: false,
            proxy: false,
            error: null
        };

        try {
            // Try direct connection first
            try {
                const response = await fetch('http://localhost:8000/api-test', {
                    method: 'GET',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000 // 5 second timeout
                });
                
                if (response.ok) {
                    console.log("Direct API connection successful");
                    API_URL = 'http://localhost:8000';
                    apiStatus.direct = true;
                    return true;
                }
            } catch (error) {
                console.warn("Direct API connection failed:", error.message);
                apiStatus.error = error;
            }

            // Try proxy connection
            try {
                const response = await fetch('/proxy/api-test', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                });
                
                if (response.ok) {
                    console.log("Proxy API connection successful");
                    API_URL = '/proxy';
                    apiStatus.proxy = true;
                    return true;
                }
            } catch (error) {
                console.warn("Proxy API connection failed:", error.message);
                apiStatus.error = error;
            }

            // If both attempts fail, set up fallback mode
            if (!apiStatus.direct && !apiStatus.proxy) {
                console.warn("All API connections failed, entering fallback mode");
                API_URL = '';
                
                // Set up mock data handlers
                window.useMockData = true;
                setupMockDataHandlers();
                
                // Show fallback mode notice to user
                showFeedback(
                    "Running in offline mode. Some features may be limited.", 
                    true, 
                    "apiStatus"
                );
                
                return false;
            }

        } catch (error) {
            console.error("Fatal API connection error:", error);
            apiStatus.error = error;
            return false;
        } finally {
            // Log final API status
            console.log("API Connection Status:", {
                direct: apiStatus.direct,
                proxy: apiStatus.proxy,
                fallback: (!apiStatus.direct && !apiStatus.proxy),
                error: apiStatus.error?.message
            });
        }
    }

    // Mock data handlers for fallback mode
    function setupMockDataHandlers() {
        window.mockData = {
            candidates: [],
            votes: new Map(),
            votingDates: {
                start_date: Math.floor(Date.now() / 1000),
                end_date: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 1 week from now
            }
        };

        // Override API requests in fallback mode
        window.makeApiRequest = async (endpoint, method, data) => {
            if (!window.useMockData) {
                throw new Error("Mock data handler called while not in fallback mode");
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

            switch (endpoint) {
                case '/voting/dates':
                    return window.mockData.votingDates;
                case '/candidates':
                    if (method === 'GET') return window.mockData.candidates;
                    if (method === 'POST' && data) {
                        window.mockData.candidates.push({
                            id: window.mockData.candidates.length + 1,
                            ...data,
                            voteCount: 0
                        });
                    }
                    break;
                case '/vote':
                    if (method === 'POST' && data) {
                        const candidateId = data.candidate_id;
                        window.mockData.votes.set(voterId, candidateId);
                    }
                    break;
                default:
                    throw new Error(`Unknown endpoint: ${endpoint}`);
            }
        };
    }

    // Initialize wallet address display
    function initWalletDisplay() {
        const walletAddressElement = document.getElementById("walletAddress");
        if (walletAddressElement && voterId) {
            walletAddressElement.textContent = `${voterId.substring(0, 6)}...${voterId.substring(voterId.length - 4)}`;
            walletAddressElement.title = voterId;
            walletAddressElement.classList.remove("hidden");
        }
    }

    // Initialize application
    async function initApp() {
        await testApiConnection();
        
        if (await initEthers()) {
            await initContract();
            initWalletDisplay();
            
            // Initialize page-specific functionality
            if (document.getElementById("candidateList")) {
                await initVoterPage();
            } else if (document.getElementById("content-candidates")) {
                await initAdminPage();
            }
        }
    }

    // ========= VOTER PAGE FUNCTIONS =========
    async function initVoterPage() {
        try {
            ensureContract();

            const voteButton = document.getElementById("voteButton");
            const candidateList = document.getElementById("candidateList");
            const logoutButton = document.getElementById("logoutButton");
            const statusAlert = document.getElementById("statusAlert");
            
            // Show loading state
            showFeedback("Loading voting information...", false);
            
            // Load voting information with proper error handling
            await Promise.all([
                loadVotingDates().catch(error => {
                    console.error("Error loading voting dates:", error);
                    showFeedback("Failed to load voting dates", true);
                }),
                loadCandidates().catch(error => {
                    console.error("Error loading candidates:", error);
                    showFeedback("Failed to load candidates", true);
                }),
                checkVoteStatus().catch(error => {
                    console.error("Error checking vote status:", error);
                    showFeedback("Failed to check vote status", true);
                })
            ]);
            
            // Event listeners with error boundaries
            voteButton?.addEventListener("click", async (e) => {
                try {
                    await castVote();
                } catch (error) {
                    console.error("Vote casting error:", error);
                    showFeedback("Failed to cast vote: " + error.message, true);
                }
            });

            logoutButton?.addEventListener("click", async (e) => {
                try {
                    await logout();
                } catch (error) {
                    console.error("Logout error:", error);
                    window.location.href = "login.html";
                }
            });

        } catch (error) {
            console.error("Voter page initialization error:", error);
            showFeedback("Failed to initialize voting page: " + error.message, true);
        }
    }
    
    async function loadVotingDates() {
        ensureContract();
        try {
            const data = await makeApiRequest('/voting/dates');
            
            const datesDisplay = document.getElementById("datesDisplay");
            const datesLoadingIndicator = document.getElementById("datesLoadingIndicator");
            
            if (datesDisplay) {
                const start = new Date(data.start_date * 1000).toLocaleString();
                const end = new Date(data.end_date * 1000).toLocaleString();
                datesDisplay.textContent = `${start} - ${end}`;
            }
            
            if (datesLoadingIndicator) {
                datesLoadingIndicator.classList.add("hidden");
            }
            
            // Update voting status
            const now = new Date();
            const startDate = new Date(data.start_date * 1000);
            const endDate = new Date(data.end_date * 1000);
            
            let status;
            if (now < startDate) {
                status = "not_started";
            } else if (now > endDate) {
                status = "ended";
            } else {
                status = "active";
            }
            
            updateStatusAlert(status);
        } catch (error) {
            console.error("Error loading voting dates:", error);
            const datesDisplay = document.getElementById("datesDisplay");
            const datesLoadingIndicator = document.getElementById("datesLoadingIndicator");
            
            if (datesDisplay) {
                datesDisplay.textContent = "Failed to load voting dates";
            }
            
            if (datesLoadingIndicator) {
                datesLoadingIndicator.classList.add("hidden");
            }
            
            showFeedback("Error loading voting dates: " + error.message, true);
        }
    }
    
    function updateStatusAlert(status) {
        const statusAlert = document.getElementById("statusAlert");
        const statusMessage = document.getElementById("statusMessage");
        const voteButton = document.getElementById("voteButton");
        
        if (!statusAlert || !statusMessage) return;
        
        // Set global status
        window.votingStatus = status;
        
        statusAlert.classList.remove(
            "hidden", "bg-yellow-200", "bg-green-200", "bg-red-200", 
            "dark:bg-yellow-800", "dark:bg-green-800", "dark:bg-red-800"
        );
        
        switch(status) {
            case "not_started":
                statusAlert.classList.add("bg-yellow-200", "dark:bg-yellow-800");
                statusMessage.textContent = "Voting has not started yet. Please check back later.";
                if (voteButton) voteButton.disabled = true;
                break;
            case "active":
                statusAlert.classList.add("bg-green-200", "dark:bg-green-800");
                statusMessage.textContent = "Voting is currently active. Select a candidate and cast your vote!";
                if (voteButton) voteButton.disabled = window.selectedCandidateId === null;
                break;
            case "ended":
                statusAlert.classList.add("bg-red-200", "dark:bg-red-800");
                statusMessage.textContent = "Voting has ended. Results are displayed below.";
                if (voteButton) voteButton.disabled = true;
                break;
            default:
                statusAlert.classList.add("hidden");
                break;
        }
        
        statusAlert.classList.add("fade-in");
    }
    
    async function loadCandidates() {
        ensureContract();
        const candidateList = document.getElementById("candidateList");
        if (!candidateList) return;
        
        try {
            candidateList.innerHTML = `
                <tr>
                    <td colspan="4" class="p-3 text-center">
                        <div class="flex justify-center">
                            <span class="loader"></span>
                            <span class="ml-2">Loading candidates...</span>
                        </div>
                    </td>
                </tr>
            `;
            
            const candidates = await safeContractCall(
                () => votingContract.getAllCandidates(),
                [],
                "Failed to load candidates"
            );
            
            const hasVoted = await safeContractCall(
                () => votingContract.hasVoted(voterId),
                false,
                "Failed to check voting status"
            );
            
            candidateList.innerHTML = "";
            
            if (candidates.length === 0) {
                candidateList.innerHTML = `<tr><td colspan="4" class="p-3 text-center">No candidates available</td></tr>`;
                return;
            }
            
            candidates.forEach(candidate => {
                const tr = document.createElement("tr");
                tr.className = "border-b border-gray-400 dark:border-gray-600";
                tr.innerHTML = `
                    <td class="p-3 border border-gray-400 dark:border-gray-600">
                        <input type="radio" id="candidate-${candidate.id}" name="candidate" value="${candidate.id}" class="focus:ring-green-500" ${hasVoted ? 'disabled' : ''}>
                        <label for="candidate-${candidate.id}" class="sr-only">Select ${candidate.name}</label>
                    </td>
                    <td class="p-3 border border-gray-400 dark:border-gray-600">${candidate.name}</td>
                    <td class="p-3 border border-gray-400 dark:border-gray-600">${candidate.party}</td>
                    <td class="p-3 border border-gray-400 dark:border-gray-600">${candidate.voteCount.toString()}</td>
                `;
                candidateList.appendChild(tr);
            });
            
            // Disable vote button if already voted
            if (hasVoted) {
                const voteButton = document.getElementById("voteButton");
                if (voteButton) {
                    voteButton.disabled = true;
                    voteButton.textContent = "You have already voted";
                }
                showFeedback("You have already cast your vote in this election");
            }
            
            // Enable vote button when a candidate is selected
            const radios = candidateList.querySelectorAll("input[type='radio']");
            radios.forEach(radio => {
                radio.addEventListener("change", () => {
                    window.selectedCandidateId = radio.value;
                    const voteButton = document.getElementById("voteButton");
                    if (voteButton) {
                        voteButton.disabled = window.votingStatus !== "active";
                    }
                });
            });
        } catch (error) {
            console.error("Error loading candidates:", error);
            candidateList.innerHTML = `<tr><td colspan="4" class="p-3 text-center">Failed to load candidates: ${error.message}</td></tr>`;
            showFeedback("Error loading candidates: " + error.message, true);
        }
    }
    
    async function checkVoteStatus() {
        ensureContract();
        const voteButton = document.getElementById("voteButton");
        if (!voteButton) return;
        
        try {
            const hasVoted = await safeContractCall(
                () => votingContract.hasVoted(voterId),
                false,
                "Failed to check vote status"
            );
            
            if (hasVoted) {
                voteButton.disabled = true;
                voteButton.textContent = "You have already voted";
                showFeedback("You have already cast your vote");
            }
        } catch (error) {
            console.error("Error checking vote status:", error);
        }
    }
    
    async function castVote() {
        ensureContract();
        const voteButton = document.getElementById("voteButton");
        if (!voteButton) return;
        
        const candidateId = document.querySelector("input[name='candidate']:checked")?.value;
        if (!candidateId) {
            showFeedback("Please select a candidate", true);
            return;
        }
        
        const originalButtonText = voteButton.innerHTML;
        setLoading(voteButton, true, "Casting vote...");
        
        const feedbackContainer = document.getElementById("feedbackContainer");
        if (feedbackContainer) {
            feedbackContainer.classList.add("hidden");
        }
        
        try {
            // Check if already voted
            const hasVoted = await safeContractCall(
                () => votingContract.hasVoted(voterId),
                false,
                "Failed to check vote status"
            );
            
            if (hasVoted) {
                showFeedback("You have already voted");
                voteButton.disabled = true;
                voteButton.innerHTML = "Already Voted";
                return;
            }
            
            // Cast vote on chain
            const tx = await safeContractCall(
                () => votingContract.vote(candidateId),
                null,
                "Vote transaction failed"
            );
            
            await tx.wait();
            
            // Submit vote to backend
            try {
                await makeApiRequest('/vote', 'POST', { candidate_id: parseInt(candidateId) });
            } catch (apiError) {
                console.warn("API vote recording failed, but blockchain vote successful:", apiError);
                // Continue since the blockchain vote worked
            }
            
            showFeedback("Your vote has been successfully recorded!");
            voteButton.disabled = true;
            voteButton.innerHTML = "Vote Cast Successfully";
            
            // Refresh candidates
            setTimeout(() => {
                loadCandidates();
            }, 2000);
        } catch (error) {
            showFeedback("Vote failed: " + error.message, true);
            setLoading(voteButton, false, originalButtonText);
        }
    }

    // ========= ADMIN PAGE FUNCTIONS =========
    async function initAdminPage() {
        // Check if user is admin
        if (role !== 'admin') {
            window.location.href = "index.html";
            return;
        }
        
        // Elements
        const addCandidateForm = document.getElementById("addCandidateForm");
        const setDatesForm = document.getElementById("setDatesForm");
        const updateDatesButton = document.getElementById("updateDatesButton");
        const tabButtons = document.querySelectorAll(".tab-button");
        const refreshCandidatesButton = document.getElementById("refreshCandidatesButton");
        const logoutButton = document.getElementById("logoutButton");
        
        // Initialize tabs
        tabButtons.forEach(button => {
            button.addEventListener("click", () => {
                tabButtons.forEach(btn => btn.classList.remove("active", "border-green-500", "text-green-500"));
                document.querySelectorAll(".tab-content").forEach(content => {
                    content.classList.remove("active");
                });
                
                button.classList.add("active", "border-green-500", "text-green-500");
                
                const tabId = button.id.replace("tab-", "content-");
                document.getElementById(tabId)?.classList.add("active");
                
                // Load content for specific tabs
                if (tabId === "content-voting-dates") {
                    loadVotingDatesAdmin();
                } else if (tabId === "content-results") {
                    loadResults();
                }
            });
        });
        
        // Event listeners
        addCandidateForm?.addEventListener("submit", handleAddCandidate);
        setDatesForm?.addEventListener("submit", handleSetDates);
        updateDatesButton?.addEventListener("click", handleUpdateDates);
        refreshCandidatesButton?.addEventListener("click", loadCandidatesAdmin);
        logoutButton?.addEventListener("click", logout);
        
        // Initial loads
        await loadCandidatesAdmin();
        
        // Initialize active tab content
        const activeTab = document.querySelector(".tab-content.active");
        if (activeTab) {
            if (activeTab.id === "content-voting-dates") {
                loadVotingDatesAdmin();
            } else if (activeTab.id === "content-results") {
                loadResults();
            }
        }
    }
    
    async function loadCandidatesAdmin() {
        const candidateList = document.getElementById("candidateList");
        if (!candidateList) return;
        
        candidateList.innerHTML = `
            <tr>
                <td colspan="4" class="p-3 text-center">
                    <div class="flex justify-center">
                        <span class="loader"></span>
                        <span class="ml-2">Loading candidates...</span>
                    </div>
                </td>
            </tr>
        `;
        
        try {
            const candidates = await safeContractCall(
                () => votingContract.getAllCandidates(),
                [],
                "Failed to load candidates"
            );
            
            candidateList.innerHTML = "";
            
            if (candidates.length === 0) {
                candidateList.innerHTML = `<tr><td colspan="4" class="p-3 text-center">No candidates have been added yet</td></tr>`;
                return;
            }
            
            candidates.forEach(candidate => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td class="p-3 border border-gray-600">${candidate.id}</td>
                    <td class="p-3 border border-gray-600">${candidate.name}</td>
                    <td class="p-3 border border-gray-600">${candidate.party}</td>
                    <td class="p-3 border border-gray-600">${candidate.voteCount.toString()}</td>
                `;
                candidateList.appendChild(row);
            });
            
            // Update results if on results tab
            if (document.getElementById("content-results")?.classList.contains("active")) {
                loadResults();
            }
        } catch (error) {
            console.error("Error loading candidates:", error);
            candidateList.innerHTML = `<tr><td colspan="4" class="p-3 text-center">Failed to load candidates: ${error.message}</td></tr>`;
            showFeedback("Failed to load candidates: " + error.message, true, "candidateFeedback");
        }
    }
    
    async function loadVotingDatesAdmin() {
        const currentDatesDisplay = document.getElementById("currentDatesDisplay");
        const datesLoadingIndicator = document.getElementById("datesLoadingIndicator");
        const votingStatusBadge = document.getElementById("votingStatusBadge");
        
        if (!currentDatesDisplay || !datesLoadingIndicator) return;
        
        datesLoadingIndicator.classList.remove("hidden");
        
        try {
            const data = await makeApiRequest('/voting/dates');
            
            if (data.start_date && data.end_date) {
                const start = new Date(data.start_date * 1000).toLocaleString();
                const end = new Date(data.end_date * 1000).toLocaleString();
                currentDatesDisplay.textContent = `${start} - ${end}`;
                
                // Pre-fill the form for update
                const startDateInput = document.getElementById("startDate");
                const endDateInput = document.getElementById("endDate");
                
                const startDateFormatted = new Date(data.start_date * 1000).toISOString().slice(0, 16);
                const endDateFormatted = new Date(data.end_date * 1000).toISOString().slice(0, 16);
                
                if (startDateInput) startDateInput.value = startDateFormatted;
                if (endDateInput) endDateInput.value = endDateFormatted;
                
                // Update status badge
                if (votingStatusBadge) {
                    const now = new Date();
                    const startDate = new Date(data.start_date * 1000);
                    const endDate = new Date(data.end_date * 1000);
                    
                    votingStatusBadge.classList.remove(
                        "bg-yellow-600", "bg-green-600", "bg-red-600", "hidden"
                    );
                    
                    if (now < startDate) {
                        votingStatusBadge.classList.add("bg-yellow-600");
                        votingStatusBadge.textContent = "Not Started";
                    } else if (now > endDate) {
                        votingStatusBadge.classList.add("bg-red-600");
                        votingStatusBadge.textContent = "Ended";
                    } else {
                        votingStatusBadge.classList.add("bg-green-600");
                        votingStatusBadge.textContent = "Active";
                    }
                }
            } else {
                currentDatesDisplay.textContent = "No voting dates have been set";
                if (votingStatusBadge) {
                    votingStatusBadge.classList.add("hidden");
                }
            }
            
            datesLoadingIndicator.classList.add("hidden");
        } catch (error) {
            console.error("Error loading voting dates:", error);
            currentDatesDisplay.textContent = "Failed to load voting dates";
            datesLoadingIndicator.classList.add("hidden");
            if (votingStatusBadge) {
                votingStatusBadge.classList.add("hidden");
            }
            showFeedback("Error loading voting dates: " + error.message, true, "datesFeedback");
        }
    }
    
    async function handleAddCandidate(e) {
        e.preventDefault();
        
        const nameInput = document.getElementById("name");
        const partyInput = document.getElementById("party");
        const addCandidateButton = document.getElementById("addCandidateButton");
        
        if (!nameInput || !partyInput || !addCandidateButton) return;
        
        const name = nameInput.value.trim();
        const party = partyInput.value.trim();
        
        if (!name || !party) {
            showFeedback("Please fill out all fields", true, "candidateFeedback");
            return;
        }
        
        setLoading(addCandidateButton, true, "Adding candidate...");
        
        try {
            // Add candidate on blockchain
            const tx = await safeContractCall(
                () => votingContract.addCandidate(name, party),
                null,
                "Failed to add candidate"
            );
            await tx.wait();
            
            // Add to backend
            try {
                await makeApiRequest('/candidates', 'POST', { name, party });
            } catch (apiError) {
                console.warn("API candidate submission failed, but blockchain transaction succeeded:", apiError);
                // Continue since the blockchain transaction worked
            }
            
            showFeedback("Candidate added successfully!", false, "candidateFeedback");
            nameInput.value = "";
            partyInput.value = "";
            loadCandidatesAdmin();
        } catch (error) {
            showFeedback("Error adding candidate: " + error.message, true, "candidateFeedback");
        } finally {
            setLoading(addCandidateButton, false, "Add Candidate");
        }
    }
    
    async function handleSetDates(e) {
        e.preventDefault();
        
        const startDateInput = document.getElementById("startDate");
        const endDateInput = document.getElementById("endDate");
        const setDatesButton = document.getElementById("setDatesButton");
        
        if (!startDateInput || !endDateInput || !setDatesButton) return;
        
        const startDate = new Date(startDateInput.value).getTime() / 1000;
        const endDate = new Date(endDateInput.value).getTime() / 1000;
        
        if (isNaN(startDate) || isNaN(endDate)) {
            showFeedback("Please select valid dates", true, "datesFeedback");
            return;
        }
        
        if (endDate <= startDate) {
            showFeedback("End date must be after start date", true, "datesFeedback");
            return;
        }
        
        setLoading(setDatesButton, true, "Setting dates...");
        
        try {
            // Set dates on blockchain
            const tx = await safeContractCall(
                () => votingContract.setVotingDates(Math.floor(startDate), Math.floor(endDate)),
                null,
                "Failed to set voting dates"
            );
            await tx.wait();
            
            // Update backend
            try {
                await makeApiRequest('/voting/set-dates', 'POST', {
                    start_date: Math.floor(startDate),
                    end_date: Math.floor(endDate)
                });
            } catch (apiError) {
                console.warn("API date setting failed, but blockchain transaction succeeded:", apiError);
                // Continue since the blockchain transaction worked
            }
            
            showFeedback("Voting dates set successfully!", false, "datesFeedback");
            loadVotingDatesAdmin();
        } catch (error) {
            showFeedback("Error setting dates: " + error.message, true, "datesFeedback");
        } finally {
            setLoading(setDatesButton, false, "Set New Dates");
        }
    }
    
    async function handleUpdateDates() {
        const startDateInput = document.getElementById("startDate");
        const endDateInput = document.getElementById("endDate");
        const updateDatesButton = document.getElementById("updateDatesButton");
        
        if (!startDateInput || !endDateInput || !updateDatesButton) return;
        
        const startDate = new Date(startDateInput.value).getTime() / 1000;
        const endDate = new Date(endDateInput.value).getTime() / 1000;
        
        if (isNaN(startDate) || isNaN(endDate)) {
            showFeedback("Please select valid dates", true, "datesFeedback");
            return;
        }
        
        if (endDate <= startDate) {
            showFeedback("End date must be after start date", true, "datesFeedback");
            return;
        }
        
        setLoading(updateDatesButton, true, "Updating dates...");
        
        try {
            // Update dates on blockchain
            const tx = await safeContractCall(
                () => votingContract.updateVotingDates(Math.floor(startDate), Math.floor(endDate)),
                null,
                "Failed to update voting dates"
            );
            await tx.wait();
            
            // Update backend
            try {
                await makeApiRequest('/voting/update-dates', 'POST', {
                    start_date: Math.floor(startDate),
                    end_date: Math.floor(endDate)
                });
            } catch (apiError) {
                console.warn("API date update failed, but blockchain transaction succeeded:", apiError);
                // Continue since the blockchain transaction worked
            }
            
            showFeedback("Voting dates updated successfully!", false, "datesFeedback");
            loadVotingDatesAdmin();
        } catch (error) {
            showFeedback("Error updating dates: " + error.message, true, "datesFeedback");
        } finally {
            setLoading(updateDatesButton, false, "Update Existing Dates");
        }
    }
    
    async function loadResults() {
        const resultsLoadingIndicator = document.getElementById("resultsLoadingIndicator");
        const resultsLoadingText = document.getElementById("resultsLoadingText");
        const resultsTableBody = document.getElementById("resultsTableBody");
        const resultsChart = document.getElementById("resultsChart");
        
        if (!resultsLoadingIndicator || !resultsLoadingText || !resultsTableBody || !resultsChart) return;
        
        resultsLoadingIndicator.classList.remove("hidden");
        resultsLoadingText.textContent = "Loading election results...";
        
        try {
            const candidates = await safeContractCall(
                () => votingContract.getAllCandidates(),
                [],
                "Failed to load election results"
            );
            
            // Calculate total votes
            const totalVotes = candidates.reduce((sum, candidate) => sum + parseInt(candidate.voteCount), 0);
            
            // Sort candidates by vote count (descending)
            const sortedCandidates = [...candidates].sort((a, b) => b.voteCount - a.voteCount);
            
            // Prepare data for Chart.js
            // Prepare data for Chart.js
            const labels = sortedCandidates.map(c => c.name);
            const data = sortedCandidates.map(c => parseInt(c.voteCount));
            
            // Generate colors for the chart
            function generateColors(count) {
                const colors = [
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)',
                    'rgba(199, 199, 199, 0.6)',
                    'rgba(83, 102, 255, 0.6)',
                    'rgba(40, 159, 64, 0.6)',
                    'rgba(210, 199, 199, 0.6)'
                ];
                
                // Generate more colors if needed
                if (count > colors.length) {
                    for (let i = colors.length; i < count; i++) {
                        const r = Math.floor(Math.random() * 255);
                        const g = Math.floor(Math.random() * 255);
                        const b = Math.floor(Math.random() * 255);
                        colors.push(`rgba(${r}, ${g}, ${b}, 0.6)`);
                    }
                }
                
                return colors.slice(0, count);
            }
            
            const backgroundColors = generateColors(sortedCandidates.length);
            const borderColors = backgroundColors.map(c => c.replace('0.6', '1'));
            
            // Create or update the chart
            if (window.resultsChartInstance) {
                window.resultsChartInstance.destroy();
            }
            
            window.resultsChartInstance = new Chart(resultsChart, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Votes',
                        data: data,
                        backgroundColor: backgroundColors,
                        borderColor: borderColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#cbd5e1'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#cbd5e1'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Election Results',
                            color: '#cbd5e1',
                            font: {
                                size: 16
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const votes = context.raw;
                                    const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : 0;
                                    return `Votes: ${votes} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
            
            // Update results table
            resultsTableBody.innerHTML = "";
            
            if (sortedCandidates.length === 0) {
                resultsTableBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center">No candidates have been added yet</td></tr>`;
            } else {
                sortedCandidates.forEach((candidate, index) => {
                    const votes = parseInt(candidate.voteCount);
                    const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : 0;
                    
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td class="p-3 border border-gray-600">${index + 1}</td>
                        <td class="p-3 border border-gray-600">${candidate.name}</td>
                        <td class="p-3 border border-gray-600">${candidate.party}</td>
                        <td class="p-3 border border-gray-600">${votes}</td>
                        <td class="p-3 border border-gray-600">${percentage}%</td>
                    `;
                    resultsTableBody.appendChild(row);
                });
            }
            
            resultsLoadingIndicator.classList.add("hidden");
            resultsLoadingText.textContent = "";
        } catch (error) {
            console.error("Error loading results:", error);
            resultsTableBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center">Failed to load results: ${error.message}</td></tr>`;
            resultsLoadingIndicator.classList.add("hidden");
            resultsLoadingText.textContent = "Error loading results";
        }
    }
    
    // Theme toggling functionality
    const toggleThemeButton = document.querySelector('[onclick="toggleTheme()"]');
    if (toggleThemeButton) {
        toggleThemeButton.addEventListener("click", () => {
            document.documentElement.classList.toggle("dark");
            localStorage.theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
        });
    }
    
    // Start the application
    initApp();
});

// Add event listener to logout button
document.addEventListener("DOMContentLoaded", () => {
    const logoutButton = document.getElementById("logoutButton");
    
    if (logoutButton) {
        logoutButton.addEventListener("click", async (e) => {
            e.preventDefault();
            
            try {
                // Disable button and show loading state
                logoutButton.disabled = true;
                logoutButton.innerHTML = '<span class="loader"></span><span>Logging out...</span>';
                
                await logout();
            } catch (error) {
                debugLog("Logout button error:", error);
                // Force redirect on error
                window.location.href = "login.html";
            }
        });
    } else {
        debugLog("Logout button not found in DOM");
    }
});
