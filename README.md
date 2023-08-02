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