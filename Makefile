# MTG Draft Maker - Node.js Monolith

# Variables
PROJECT_DIR := src

.PHONY: help install dev dev-server dev-client build start clean

# Default target
help:
	@echo "======================================================================"
	@echo "  MTG Draft Maker - Node.js Monolith"
	@echo "======================================================================"
	@echo "  make install     : Install dependencies"
	@echo "  make dev         : Run both Server and Client (Development)"
	@echo "  make dev-server  : Run only Server (Development)"
	@echo "  make dev-client  : Run only Client (Development)"
	@echo "  make build       : Build Backend and Frontend for Production"
	@echo "  make start       : Run built application (Production)"
	@echo "  make clean       : Clean node_modules and build artifacts"
	@echo "======================================================================"

install:
	@echo ">>> Installing dependencies..."
	cd $(PROJECT_DIR) && npm install

dev:
	@echo ">>> Starting Development Environment..."
	cd $(PROJECT_DIR) && npm run dev

dev-server:
	@echo ">>> Starting Backend (Dev)..."
	cd $(PROJECT_DIR) && npm run server

dev-client:
	@echo ">>> Starting Frontend (Dev)..."
	cd $(PROJECT_DIR) && npm run client

build:
	@echo ">>> Building for Production..."
	cd $(PROJECT_DIR) && npm run build

start:
	@echo ">>> Starting Production Server..."
	cd $(PROJECT_DIR) && npm run start

clean:
	@echo ">>> Cleaning artifacts..."
	rm -rf $(PROJECT_DIR)/node_modules
	rm -rf $(PROJECT_DIR)/dist
	rm -rf $(PROJECT_DIR)/client/dist
