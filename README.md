# SchedulerAI - AI-Powered University Timetable Generator & Copilot

> ### 🔗 **[Live Demo: Try SchedulerAI Live in the Browser!](https://shahid-ayub.github.io/ai-timetable-generator/)**

SchedulerAI is a modern, interactive client-side web application designed to automate, optimize, and manage university course scheduling. It features a constraint-satisfaction scheduling solver, real-time conflict audits, drag-and-drop schedule editing, and an advanced **AI Copilot** capable of parsing schedule documents and executing scheduling commands.

---

## 🚀 Key Features

* **Interactive Timetable Board**: A visual calendar grid with drag-and-drop support to easily rearrange classes and resolve clashes.
* **AI Scheduler Solver**: A built-in heuristic solver that automatically schedules lectures and labs while satisfying complex constraints (faculty availability, room capacities, course sections, etc.).
* **AI Copilot Chat**: An interactive assistant that acts on voice or text commands (e.g., *"move CS-101 to Monday Period 2"*, *"make Dr. Alice busy on Friday"*).
* **Timetable Document Parser**: Automatically parse raw text, CSVs, or uploaded schedule documents using Gemini or OpenAI models.
* **Constraint Compliance Audits**: Real-time checking for structural conflicts such as teacher unavailability, room capacity overflows, room type mismatches, and section clashes.
* **Exporting Options**: Download your generated timetables as PDF, tabular CSV, or backup JSON files.

---

## 🛠️ Installation & Setup

Follow these steps to run the application locally on your machine:

### 1. Clone the Repository
```bash
git clone https://github.com/Shahid-Ayub/ai-timetable-generator.git
cd ai-timetable-generator
```

### 2. Configure Environment Variables
Copy the `.env.example` template to create your local `.env` configuration:
```bash
cp .env.example .env
```
Open the `.env` file and insert your API keys:
```env
PRIMARY_GEMINI_KEY=your_gemini_api_key_here
PRIMARY_GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_API_KEY=your_openrouter_api_key_here
```
*(Note: `.env` is ignored by Git to keep your API keys private and secure.)*

### 3. Start the Server
Run the local python development server:
```bash
python run_server.py
```
Or if you prefer using PowerShell:
```powershell
./run_server.ps1
```
The server will start on port `8000` (or another customized port) and automatically open the application in your default web browser at `http://localhost:8000`.

---

## 🤖 AI Provider Settings

If you don't have a `.env` file configured, you can also manage providers directly from the browser:
1. Open the application.
2. Open the **Copilot Settings** panel in the bottom right corner.
3. Choose your provider (Gemini, OpenAI, OpenRouter, or Offline Local Mode) and save your keys. Credentials will be saved securely to your browser's local storage.

---

## 📁 Project Structure

```text
├── js/
│   ├── app.js          # Main Application Controller & UI bindings
│   ├── copilot.js      # AI Copilot engine and network request pipeline
│   ├── db.js           # Local database manager (backed by LocalStorage)
│   ├── parser.js       # Basic file parsing utility
│   ├── scheduler.js    # Hard/Soft constraints and conflict checker
│   └── worker.js       # Background thread solving algorithms
├── index.html          # Main application interface markup
├── index.css           # Vanilla styling layout rules
├── run_server.py       # Python local web server
├── run_server.ps1      # PowerShell local web server script
├── .env.example        # Configuration template
└── README.md           # This documentation page
```
