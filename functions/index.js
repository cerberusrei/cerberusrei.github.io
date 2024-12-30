/* eslint-disable indent */
/**
 * Migrate to Firebase Functions v2.
 * Using `onRequest` from `firebase-functions/v2/https`.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const express = require("express");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin SDK
initializeApp();

const app = express();

app.get("/album/:fileId", (req, res) => {
    console.log(`__dirname is ${__dirname}`);

    // Read raw content of index.html
    const indexPath = path.resolve(__dirname, "./public/index.html");
    let html = fs.readFileSync(indexPath, "utf8");

    // Extract and rewrite URL and parameters
    const currentPath = req.originalUrl.split("?")[0];

    // Replace placeholders in the HTML
    html = html
        .replace(
            /<link rel="canonical" href=".*">/,
            `<link rel="canonical" href="${req.protocol}://${req.get("host")}${currentPath}">`,
        );

    res.send(html);
});

// Export the Express app as a Cloud Function
exports.rewriter = onRequest(app);
