FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY middleware.js ./

# Create logs directory
RUN mkdir -p logs

# Expose HL7 port
EXPOSE 2575

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const net=require('net');const c=net.createConnection(2575,'localhost');c.on('connect',()=>c.end());c.on('error',(e)=>process.exit(1));"

# Start the application
CMD ["npm", "start"]