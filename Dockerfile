# Use a Node.js image as a base
FROM node:16

# Set the working directory
WORKDIR /app

# Copy the project files
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port 10000 (used by the server)
EXPOSE 10000

# Launch the add-on
CMD ["node", "index.js"]
