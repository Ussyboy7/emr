# Fixing Server Setup Issues

## Issue 1: apt update failing with "Clearsigned file isn't valid"

This is likely due to network configuration or outdated repository keys. Try these solutions:

### Solution A: Update package keys and try again
```bash
# Update package keys
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 871920D1991BC93C
sudo apt update
```

### Solution B: Use a different mirror
```bash
# Backup current sources
sudo cp /etc/apt/sources.list /etc/apt/sources.list.backup

# Use a different mirror (replace with your country's mirror)
sudo sed -i 's/archive.ubuntu.com/mirror.ubuntu.com/g' /etc/apt/sources.list
sudo apt update
```

### Solution C: Install without updating (if git is already available)
```bash
# Skip apt update and install git directly
sudo apt install -y git --allow-unauthenticated
```

## Issue 2: Git SSL certificate verification failed

This prevents cloning from GitHub. Solutions:

### Solution A: Disable SSL verification (temporary)
```bash
# Clone with SSL verification disabled
GIT_SSL_NO_VERIFY=true git clone https://github.com/Ussyboy7/emr.git emr
```

### Solution B: Install CA certificates
```bash
# Install ca-certificates
sudo apt install -y ca-certificates

# Update CA certificates
sudo update-ca-certificates

# Then try cloning normally
git clone https://github.com/Ussyboy7/emr.git emr
```

### Solution C: Use SSH instead of HTTPS (if you have SSH keys set up)
```bash
# If you have SSH access to GitHub
git clone git@github.com:Ussyboy7/emr.git emr
```

## Complete Fix Sequence

Try this step-by-step:

```bash
# 1. Fix apt (try Solution A first)
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 871920D1991BC93C
sudo apt update

# 2. Install git if needed
sudo apt install -y git

# 3. Install CA certificates
sudo apt install -y ca-certificates
sudo update-ca-certificates

# 4. Clone repository
cd ~
git clone https://github.com/Ussyboy7/emr.git emr
cd emr

# 5. Verify clone
ls -la
git status
```

## Alternative: Manual File Transfer

If network issues persist, you can:

1. Download the repository as ZIP from GitHub on your local machine
2. Transfer the ZIP to the server via SCP
3. Extract and set up on the server

```bash
# On your local machine
wget https://github.com/Ussyboy7/emr/archive/refs/heads/main.zip -O emr.zip
scp emr.zip emrprod@172.16.0.32:~/

# On the server
unzip emr.zip
mv emr-main emr
cd emr
```

## Network Troubleshooting

Check network connectivity:

```bash
# Test internet connection
ping -c 4 8.8.8.8

# Test DNS resolution
nslookup github.com

# Test HTTPS connectivity
curl -I https://github.com
```

If you're behind a corporate proxy, you may need to configure proxy settings:

```bash
# Set proxy for apt
sudo tee -a /etc/apt/apt.conf.d/99proxy > /dev/null <<EOF
Acquire::http::Proxy "http://proxy.company.com:8080";
Acquire::https::Proxy "http://proxy.company.com:8080";
EOF

# Set proxy for git
git config --global http.proxy http://proxy.company.com:8080
git config --global https.proxy http://proxy.company.com:8080
```

Replace `proxy.company.com:8080` with your actual proxy details.

Once you resolve these issues, you can proceed with the EMR setup phases.