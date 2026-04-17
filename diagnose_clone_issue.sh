# EMR Clone Issue - Files Not Visible

**Clone completed successfully but files aren't showing. This is unusual. Let's diagnose:**

```bash
cd ~/emr

# Check if directory exists and permissions
pwd
ls -lad .

# Check if files exist but are hidden
ls -la

# Check disk space
df -h .

# Check git repository
git log --oneline -1
git branch
git remote -v

# Try to list files with different methods
find . -maxdepth 1 -type f | head -10
ls -1 2>/dev/null || echo "ls failed"

# Check if it's a permission issue
whoami
id
ls -ld ~/emr
```

## If Files Exist But Aren't Visible:

```bash
# Force list all files
find ~/emr -type f -name "*.yml" 2>/dev/null
find ~/emr -type f -name "*.env" 2>/dev/null

# Check if docker-compose exists
ls -la ~/emr/docker-compose.prod.yml 2>/dev/null || echo "docker-compose not found"
```

## If Clone Failed:

```bash
# Clean up and try again
cd ~
rm -rf emr

# Try clone with verbose output
git clone --verbose https://github.com/Ussyboy7/emr.git

# Or try with different method
wget -O emr.zip https://github.com/Ussyboy7/emr/archive/refs/heads/main.zip
unzip emr.zip
mv emr-main emr
```

## Alternative: Manual Download

```bash
# If git clone has issues, download manually
cd ~
wget -O emr.tar.gz https://github.com/Ussyboy7/emr/archive/refs/heads/main.tar.gz
tar -xzf emr.tar.gz
mv emr-main emr
cd emr
ls -la
```

**What's the output of `pwd` and `ls -lad .` when you're in the EMR directory?** 🔍

**This will help us understand why the files aren't visible!** 📁

**Once we identify the issue, EMR will be ready to launch!** 🚀