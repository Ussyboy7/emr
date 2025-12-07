# NPA EMR Status Page

Real-time status and uptime monitoring for the Nigerian Ports Authority Electronic Medical Records System.

**Live Status:** [View Status Page](https://ussyboy7.github.io/npa-emr-status/)

## 🚀 Quick Setup Guide

### Step 1: Create a New GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Create a new **public** repository named `npa-emr-status`
3. Don't initialize with README (we'll add our own files)

### Step 2: Copy Files to the New Repository

```bash
# Clone the new repo
git clone https://github.com/Ussyboy7/npa-emr-status.git
cd npa-emr-status

# Copy the config file
cp /path/to/emr/status-page/.upptimerc.yml .

# Create assets folder for logo
mkdir -p assets
# Add your NPA logo as assets/npa-logo.png

# Commit and push
git add .
git commit -m "Initial Upptime setup"
git push origin main
```

### Step 3: Enable GitHub Actions

1. Go to your repo → **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select **"Read and write permissions"**
3. Check **"Allow GitHub Actions to create and approve pull requests"**
4. Click **Save**

### Step 4: Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under "Source", select **"GitHub Actions"**
3. Save

### Step 5: Run the Workflow

1. Go to your repo → **Actions** tab
2. Click on **"Setup CI"** workflow
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait ~2 minutes for it to complete

### Step 6: View Your Status Page! 🎉

Visit: `https://ussyboy7.github.io/npa-emr-status/`

---

## 📊 What Gets Monitored

| Service             | Endpoint                            | Description          |
| ------------------- | ----------------------------------- | -------------------- |
| NPA EMR Frontend    | `http://172.16.0.46:4647`           | Main web application |
| NPA EMR API         | `/api/health/`                      | Backend health check |
| Authentication      | `/api/accounts/auth/me/`            | Login service        |
| Patients API        | `/api/patients/patients/`           | Patient management   |
| Laboratory API      | `/api/laboratory/orders/`           | Lab orders           |
| Pharmacy API        | `/api/pharmacy/prescriptions/`       | Prescriptions        |
| Radiology API       | `/api/radiology/orders/`            | Imaging orders       |

---

## 🔔 Setting Up Notifications (Optional)

### Slack Notifications

1. Create a Slack webhook URL in your workspace
2. Go to repo **Settings** → **Secrets** → **Actions**
3. Add new secret: `SLACK_WEBHOOK_URL`
4. Uncomment the notifications section in `.upptimerc.yml`

### Email Notifications

Add your email in the notifications section of `.upptimerc.yml`

---

## 🌐 Custom Domain (Optional)

To use `status.emr.npa.gov.ng`:

1. Add a CNAME record in your DNS:

   ```
   status.emr.npa.gov.ng → ussyboy7.github.io
   ```

2. Uncomment the `cname` line in `.upptimerc.yml`:

   ```yaml
   status-website:
     cname: status.emr.npa.gov.ng
   ```

3. Push the change and wait for DNS propagation

---

## 📁 Repository Structure (Auto-generated)

After first run, Upptime will create:

```
npa-emr-status/
├── .upptimerc.yml          # Configuration (you create this)
├── README.md               # Auto-updated with status badges
├── api/                    # JSON API for status data
├── graphs/                 # Response time graphs
├── history/                # Historical uptime data
└── .github/
    └── workflows/          # Auto-generated CI workflows
```

---

## 🔧 Updating Configuration

To add/remove monitored sites:

1. Edit `.upptimerc.yml`
2. Commit and push
3. Upptime will automatically update

---

## 📖 Resources

- [Upptime Documentation](https://upptime.js.org/)
- [Configuration Options](https://upptime.js.org/docs/configuration)
- [GitHub Repository](https://github.com/upptime/upptime)

---

## 🏢 About NPA EMR

The Nigerian Ports Authority Electronic Medical Records System (NPA EMR) is a comprehensive solution for managing patient records, laboratory tests, pharmacy prescriptions, and radiology studies within the organization.

**Main Application:** [NPA EMR](http://172.16.0.46:4647)

