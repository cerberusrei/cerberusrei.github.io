# Google cloud console
## OAuth consent screen
- User type = External
- Test user: Add google e-mail of the account which is allowed to use this app.
  - This is required if we add restricted/sensitive scope into OAuth.

### Scopes
- Add .../auth/drive.metadata for updating metadata like custom properties

## Credentials
### OAuth 2.0 Client IDs
- Authorized JavaScript origins:
  - Add public one. e.g. https://cerberusrei.github.io
  - Add local one if we need to test on local. e.g http://localhost
- Authorized redirect URIs
  - Add public one. e.g. https://cerberusrei.github.io/
  - Add local one if we need to test on local. e.g. http://localhost:8080/
    - Without this, we won't be able to switch/login accounts on local

## API Keys
- Set an application restriction
  - Choose "None" for local testing
  - Choose "Website" for public one
- API restrictions
  - Choose "Google Drive API"

## SEO
- Use [Google rich results tool to test](https://search.google.com/test/rich-results)
- Add following content as index.html if home page is not in root path
```
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=public/viewer/index-v2.html">
    <meta name="description" content="よさこいの写真と動画がいっぱい。高知の祭り、伝統的な日本の踊りやパフォーマンスの写真もあります." lang="ja">
    <meta name="description" content="Photos mainly for yosakoi, others for soran, kids dance, traditional Japanese dance and performances." lang="en">
    <title>Yosakoi album - Redirecting | よさこい写真 - ダイレクト中</title>
</head>
<body>
    <p aria-live="polite">If you are not redirected automatically, follow this <a href="public/viewer/index-v2.html">link</a>.</p>
</body>
</html>
```