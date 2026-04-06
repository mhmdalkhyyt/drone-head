FROM node:20

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Rebuild native modules to ensure compatibility with container's Node.js version
RUN npm rebuild better-sqlite3

# Copy source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["npm", "start"]