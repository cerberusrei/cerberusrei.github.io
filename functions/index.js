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
    const fileId = req.params.fileId;
    console.log(`__dirname is ${__dirname}`);

    // Read raw content of index.html
    const indexPath = path.resolve(__dirname, "./public/index.html");
    let html = fs.readFileSync(indexPath, "utf8");

    // Extract and rewrite URL and parameters
    const currentPath = req.originalUrl.split("?")[0];
    const currentParams = new URLSearchParams(req.query);
    currentParams.set("fileId", fileId);
    const newPathWithParams = `${currentPath}?${currentParams.toString()}`;
    console.log(`newPathWithParams = ${newPathWithParams}`);

    // Extract the current `t` value from the script tag
    const currentScriptMatch = html.match(/<script src="js\/gallery\.js\?t=(\d+)"/);
    const timestamp = currentScriptMatch ? currentScriptMatch[1] : Date.now();

    // Replace placeholders in the HTML
    html = html
        .replace(
            /<script src="js\/gallery\.js\?t=\d+">.*<\/script>/,
            `<script>window.history.replaceState({}, '', '${newPathWithParams}');</script>
                        <script src="js/gallery.js?t=${timestamp}"></script>`,
        )
        .replace(
            /<link rel="canonical" href=".*">/,
            `<link rel="canonical" href="${req.protocol}://${req.get("host")}${currentPath}">`,
        );

    res.send(html);
});

// Export the Express app as a Cloud Function
exports.rewriter = onRequest(app);
