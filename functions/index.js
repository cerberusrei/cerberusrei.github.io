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


// The host retrieved by Google SEO will be "rewriter-osh643qiva-uc.a.run.app", so we try to hard code it
// e.g. `<link rel="canonical" href="${req.protocol}://${req.get("host")}${currentPath}">` is not usable
const publicHost = "https://linen-sun-367015.web.app";

const indexSeoMeta = {
    albumId: "",
    title: "よさこい写真",
    coverImage: "https://linen-sun-367015.web.app/images/20240601_144634.jpg",
    publishedDate: "2024-05-19T08:00:00+08:00",
    modifiedDate: "2025-03-02T08:00:00+08:00",
    keywords: "",
    jpDescription: "よさこいの写真と動画がいっぱい。" +
        "高知の祭り、ソーラン、阿波踊り、キッズダンス、伝統的な日本の踊りやパフォーマンスの写真もあります。",
    enDescription: "Photos mainly for yosakoi, " +
        "others for soran, kids dance, traditional Japanese dance and performances.",
    canonical: `${publicHost}/index.html`,
};

// set temporary cache to reduce loading though it maybe not helpful for low traffic
let htmlTemplate = null;
let indexHtml = null;
let seoMetaList = null;

// serve the index of our website at /
app.get("/", (req, res) => {
    const fileId = req.query.fileId;
    console.debug(`fileId is ${fileId}`);

    if (fileId) {
        // serialize remaining query parameters, if any
        const queryParams = {...req.query};
        delete queryParams.fileId;
        const queryString = new URLSearchParams(queryParams).toString();

        // redirect
        const redirectUrl = `/album/${fileId}${queryString ? `?${queryString}` : ""}`;
        return res.redirect(301, redirectUrl);
    }

    if (!indexHtml) {
        indexHtml = injectSeoInfo(loadHtmlTemplate(), indexSeoMeta);
        console.log("Loaded content of index.html");
    }

    // Serve the default home.html
    res.send(indexHtml);
});

// serve requests to /album/:fileId
app.get("/album/:fileId", (req, res) => {
    console.log(`__dirname is ${__dirname}`);

    const seoMeta = getSeoInfo(req.params.fileId);
    const html = loadHtmlTemplate();

    res.send(injectSeoInfo(html, seoMeta));
});

/**
 * Get SEO information for the given album ID.
 * @param {string} id - The album ID.
 * @return {object} The SEO information.
 */
function getSeoInfo(id) {
    loadSeoMeta();

    const seoMeta = seoMetaList.find((meta) => meta.albumId === id);
    if (seoMeta) {
        seoMeta.coverImage = `https://drive.google.com/thumbnail?authuser=0&sz=w512&id=${seoMeta.coverImage}`;
        seoMeta.canonical = `${publicHost}/album/${seoMeta.albumId}`;
        seoMeta.jpDescription = `${seoMeta.title}の写真と動画`;
        seoMeta.enDescription = `Photos and videos of ${seoMeta.title}`;
        return seoMeta;
    }

    return createMissingAlbumSeoInfo(id);
}

/**
 * Create SEO information for the missing album ID.
 * @param {string} id - The album ID.
 * @return {object} The SEO information.
 */
function createMissingAlbumSeoInfo(id) {
    const dataDate = new Date().toISOString().split("T")[0];

    return {
        albumId: id,
        title: id + " is not found",
        coverImage: "https://linen-sun-367015.web.app/images/20240601_144634.jpg",
        publishedDate: dataDate,
        modifiedDate: dataDate,
        keywords: "",
        canonical: `${publicHost}/album/${id}`,
        jpDescription: `アルバム - ${id} は利用できません`,
        enDescription: `The album - ${id} is unavailable`,
    };
}

/**
 * Replace SEO information for the given HTML content.
 * @param {string} html - The HTML content to replace.
 * @param {Object} seoMeta - The SEO information for the HTML content.
 * @return {string} The new HTML content.
 */
function injectSeoInfo(html, seoMeta) {
    return html.replace(/\${title}/g, seoMeta.title)
        .replace(/\${keywords}/g, seoMeta.keywords ? seoMeta.keywords + ", " : seoMeta.keywords)
        .replace(/\${jpDescription}/g, `${seoMeta.jpDescription}`)
        .replace(/\${enDescription}/g, `${seoMeta.enDescription}`)
        .replace(/\${coverImage}/g, seoMeta.coverImage)
        .replace(/\${canonical}/g, seoMeta.canonical)
        .replace(/\${publishedDate}/g, seoMeta.publishedDate)
        .replace(/\${modifiedDate}/g, seoMeta.modifiedDate);
}

/**
 * Read HTML template file.
 * @return {string} The HTML template.
 */
function loadHtmlTemplate() {
    if (htmlTemplate) {
        return htmlTemplate;
    }

    // Read raw content of home.html
    const indexPath = path.resolve(__dirname, "./public/home.html");
    htmlTemplate = fs.readFileSync(indexPath, "utf8");
    return htmlTemplate;
}

/**
 * Load SEO information into seoMetaList.
 */
function loadSeoMeta() {
    if (seoMetaList) {
        return;
    }

    const seoMetaPath = path.resolve(__dirname, "./seo-meta.json");
    const seoMetaJson = fs.readFileSync(seoMetaPath, "utf8");
    seoMetaList = JSON.parse(seoMetaJson);
}

// Export the Express app as a Cloud Function
exports.rewriter = onRequest(app);
