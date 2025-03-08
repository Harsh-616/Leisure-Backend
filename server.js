require("dotenv").config({ path: __dirname + "/.env" }); // Load .env from the server folder
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const app = express();
const { google } = require("googleapis");

app.use(
  cors({
    origin: "https://leisure-frontend.vercel.app", // Allow requests from frontend
    credentials: true, // Allow cookies and authentication headers
  })
);

// Load environment variables
const PASSWORDS_SHEET_ID = process.env.PASSWORDS_SHEET_ID;
const PRICES_SHEET_ID = process.env.PRICES_SHEET_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CREDENTIALS = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString(
    "utf-8"
  )
);

// Initialize Express app
app.use(express.static(path.join(__dirname, "../client"))); // Serve static files
app.use(express.json()); // Parse JSON request
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded form data
app.use(cookieParser()); // Middleware to handle cookies

// Function to authenticate with Google Sheets API
async function getSheetData(sheetId, range) {
  console.log("Fetching sheet data...");
  const auth = new google.auth.JWT(
    GOOGLE_CREDENTIALS.client_email,
    null,
    GOOGLE_CREDENTIALS.private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range,
  });
  console.log("Sheet data fetched.");
  return response.data.values;
}

// 🛠️ **User Authentication Endpoint**
app.post("/authenticate", async (req, res) => {
  const { username, password, deviceIdentifier } = req.body;

  try {
    // Fetch user data from Google Sheets
    const data = await getSheetData(PASSWORDS_SHEET_ID, "Sheet1!A2:E100");
    const users = data.map((row) => ({
      username: row[0],
      password: row[1],
      allowedDevice: row[2],
      phone: row[3],
      designation: row[4],
    }));

    // Validate user credentials
    const user = users.find(
      (user) => user.username === username && user.password === password
    );

    if (user) {
      const token = jwt.sign(
        {
          username: user.username,
          phone: user.phone,
          designation: user.designation,
        },
        JWT_SECRET,
        { expiresIn: "1h" } // Token expires in 1 hour
      );
      console.log("process1.");

      res.json({ success: true, token });
    } else {
      res.status(401).send("Invalid credentials.");
    }
  } catch (error) {
    console.error("Error authenticating user:", error);
    res.status(500).send("Internal server error.");
  }
});

// 🔐 **Middleware to Authenticate User**
function authenticateToken(req, res, next) {
  const token = req.cookies.token; // Read JWT from HTTP-Only cookie

  if (!token) {
    return res.status(401).send("Access denied. No token provided.");
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send("Invalid token.");
    }
    req.user = user; // Attach user data to request
    next();
  });
}

// 🔓 **Logout Endpoint (Clears JWT Cookie)**
app.post("/logout", (req, res) => {
  res.clearCookie("token"); // Remove JWT token cookie
  res.json({ success: true, message: "Logged out successfully" });
});

// 🔍 **Protected Route to Fetch User Data**
app.get("/get-user-data", authenticateToken, (req, res) => {
  const { username, phone, designation } = req.user;
  res.json({ username, phone, designation });
});

// 📊 **Protected Route to Fetch Price Data**
app.get("/get-data", authenticateToken, async (req, res) => {
  try {
    const data = await getSheetData(PRICES_SHEET_ID, "Sheet1!A1:Z100");
    res.json({ data });
  } catch (error) {
    console.error("Error fetching price data:", error);
    res.status(500).json({ error: "Failed to retrieve data." });
  }
});

// 🚀 **Start the Server**
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
