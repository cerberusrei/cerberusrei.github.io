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

// serve the index of our website at /
app.get("/", (req, res) => {
    const fileId = req.query.fileId;
    console.log(`fileId is ${fileId}`);

    if (fileId) {
        // serialize remaining query parameters, if any
        const queryParams = {...req.query};
        delete queryParams.fileId;
        const queryString = new URLSearchParams(queryParams).toString();

        // redirect
        const redirectUrl = `/album/${fileId}${queryString ? `?${queryString}` : ""}`;
        return res.redirect(301, redirectUrl);
    }

    // Serve the default home.html
    const indexPath = path.resolve(__dirname, "./public/home.html");
    const html = fs.readFileSync(indexPath, "utf8");

    res.send(html);
});

// serve requests to /album/:fileId
app.get("/album/:fileId", (req, res) => {
    console.log(`__dirname is ${__dirname}`);

    // Read raw content of home.html
    const indexPath = path.resolve(__dirname, "./public/home.html");
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
