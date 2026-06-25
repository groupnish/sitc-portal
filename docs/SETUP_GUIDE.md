# SITC Project Portal — Setup & Deployment Guide

## What you get
- Multi-project portal with role-based access
- GRN (material inward), Dispatch notes, Site progress, RA bill generator
- Gmail email notifications, WhatsApp one-click messaging
- PWA installable on Android and iOS
- PDF + Excel export of RA bills
- Cost: ₹0/month (GitHub + Render free + GitHub Pages)

---

## Folder structure
```
sitc-portal/
├── backend/        ← Python Flask API
│   ├── app.py
│   ├── config.py
│   ├── seed.py     ← Run once to set up admin + BEIL project
│   ├── models/
│   ├── routes/
│   └── services/
└── frontend/       ← React PWA (built separately)
```

---

## STEP 1 — Gmail App Password (for email notifications)

1. Go to your company Gmail → My Account → Security
2. Turn on 2-Step Verification (required)
3. Search "App Passwords" → Create new → Name it "SITC Portal"
4. Copy the 16-character password (e.g. abcd efgh ijkl mnop)
5. Save it — you'll need it in Step 3

---

## STEP 2 — Push code to GitHub (free)

1. Create account at github.com (free)
2. Create new repository: "sitc-portal" (private recommended)
3. On your computer, open Terminal / Command Prompt:
   ```
   cd sitc-portal
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOURUSERNAME/sitc-portal.git
   git push -u origin main
   ```

---

## STEP 3 — Deploy backend on Render.com (free)

1. Go to render.com → Sign up free (use GitHub login)
2. Click "New +" → "Web Service"
3. Connect your GitHub repo → select "sitc-portal"
4. Fill in:
   - Name: sitc-portal-api
   - Root Directory: backend
   - Runtime: Python 3
   - Build Command: pip install -r requirements.txt
   - Start Command: gunicorn app:app --workers 2 --bind 0.0.0.0:$PORT
5. Click "Add Environment Variables" and add:
   ```
   SECRET_KEY         = (generate random 32+ chars)
   JWT_SECRET_KEY     = (generate different random 32+ chars)
   GMAIL_USER         = yourcompany@gmail.com
   GMAIL_APP_PASSWORD = your-16-char-app-password
   CORS_ORIGINS       = https://YOURUSERNAME.github.io
   ```
6. Click "Create Web Service" → wait ~3 minutes
7. Render will give you a URL like: https://sitc-portal-api.onrender.com
8. Click "+ New" → "PostgreSQL" → free plan → link to your web service
   - Render auto-sets DATABASE_URL for you

---

## STEP 4 — Run database seed (one-time)

After deploy, open Render dashboard → your web service → Shell:
```
python seed.py
```
This creates:
- Admin: admin@company.com / Admin@1234
- SCM: scm@company.com / Pass@1234
- Accounts: accounts@company.com / Pass@1234
- Site: site@company.com / Pass@1234
- Management: mgmt@company.com / Pass@1234
- BEIL WO-249 project with all 97 BOQ items

**Change all passwords after first login!**

---

## STEP 5 — Deploy frontend on GitHub Pages (free)

1. In the frontend folder, edit src/config.js:
   ```js
   export const API_URL = "https://sitc-portal-api.onrender.com/api"
   ```
2. Build and deploy:
   ```
   cd frontend
   npm install
   npm run build
   ```
3. In GitHub → your repo → Settings → Pages → Source: Deploy from branch
4. Choose branch "gh-pages" → Save
5. Your portal will be live at: https://YOURUSERNAME.github.io/sitc-portal

---

## PWA Installation

### Android (Chrome)
1. Open portal URL in Chrome
2. Tap the 3-dot menu → "Add to Home Screen"
3. App icon appears on home screen — works like a native app

### iPhone / iPad (Safari only)
1. Open portal URL in Safari (must be Safari, not Chrome)
2. Tap the Share button (square with arrow)
3. Scroll down → "Add to Home Screen"
4. Name it "SITC Portal" → Add

---

## WhatsApp Integration

No setup needed. Each document (GRN, Dispatch, RA Bill) has a WhatsApp button.
- On desktop: opens WhatsApp Web with pre-filled message
- On mobile: opens WhatsApp app directly
- Make sure each user's WhatsApp number is saved in their profile (Admin → User Management)

---

## Adding a new project (Admin)

1. Login as Admin
2. Go to Admin → Projects → New Project
3. Fill client details, WO details, payment terms
4. Go to BOQ → Add items (paste or upload Excel)
5. Assign team members to the project
6. Team can start creating GRNs immediately

---

## Wake-up time (Render free tier)

Render free tier sleeps after 15 min idle. First load of the day takes ~40-60 seconds.
After that it runs fast. If this becomes a problem, upgrade to Render Starter ($7/month = ~₹585).

---

## Support & updates

To update the portal:
1. Make changes to code
2. git add . && git commit -m "Update" && git push
3. Render auto-deploys the backend within 2 minutes
4. Run npm run build && push to deploy frontend update

---

## Security checklist before going live

- [ ] Change all default passwords
- [ ] Use a strong SECRET_KEY (32+ random characters)
- [ ] Keep .env file out of GitHub (.gitignore handles this)
- [ ] Set CORS_ORIGINS to only your GitHub Pages URL
- [ ] Enable Gmail 2-step verification
