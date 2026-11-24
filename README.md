# Forms Utility Helper (Google Forms + Gemini Flash Lite Extension)

A Chrome Manifest V3 extension for Google Forms (`https://docs.google.com/forms/*`) powered by a free-tier Gemini API key (`gemini-3.5-flash-lite`) with built-in **15 RPM (Requests Per Minute)** rate limiting and full-form contextual awareness.

---

## Mandatory Acceptable Use Policy & Anti-Cheating Disclaimer

**We strictly DO NOT allow, endorse, or support the use of this software for cheating on tests, quizzes, exams, or any academic or professional assessments.**

This repository is provided strictly for:
- Testing your own Google Forms (e.g., validating form workflows such as `https://forms.gle/i29S7UFn1EGTs2fN6`)
- Studying browser DOM manipulation, Closure/Wiz event dispatching, and client-side LLM rate-limiting queues
- Accessibility and UI prototyping research

Using automated assistants or unauthorized browser extensions during an academic assessment violates academic integrity policies and can result in severe disciplinary consequences.

---

## Report: Can This Extension Be Detected by a Teacher or Proctoring System?

**Short Answer: Yes, in managed or proctored environments; Partially/Indirectly in unmanaged environments.**

Below is a technical breakdown of how teachers, school IT administrators, and modern assessment platforms can or cannot detect an extension like this across five layers.

### 1. Standard Unmanaged Personal Device (Teacher Looking Only at Google Forms Responses)
- **Direct Google Forms Telemetry (`Low Detection`)**: Standard Google Forms does **not** run extension-enumeration scripts or send client-side DOM mutation logs back to the form creator. A teacher viewing only the Google Forms "Responses" tab sees only the final submitted answers and the submission timestamp.
- **Indirect Behavioral Signals (`Medium Detection`)**:
  - **Submission Completion Time**: Even with the 15 RPM rate limiter (~4 seconds per question), completing a 15-question test in ~60 seconds leaves an abnormally fast completion timestamp if the teacher tracks when the form link was distributed vs. when it was submitted.
  - **Free-Response Stylistic Signatures**: On short-answer and paragraph questions, LLM responses often exhibit uniform punctuation, phrasing, and vocabulary across students who use the same model (`gemini-3.5-flash-lite` at low temperature).

### 2. Google Forms "Locked Mode" on Managed Chromebooks (`100% Blocked / Detected`)
- When a teacher enables **Locked Mode in Quizzes** on Google Workspace for Education Chromebooks:
  - Chrome OS locks the browser into a single kiosk-like assessment window.
  - **All third-party and unpacked user extensions are automatically disabled** for the duration of the quiz.
  - Attempting to exit full-screen or tamper with the session immediately notifies the teacher with a timestamped alert.

### 3. School-Managed Accounts & Admin Console (`High Detection`)
- If a student is signed into a **school-managed Chrome profile** (`@school.edu`) or using a school-issued device:
  - Google Workspace Admin Console allows IT administrators and teachers (via classroom management tools like **GoGuardian Teacher**, **Hapara**, **Lightspeed Classroom**, or **Securly**) to call `chrome.management.getAll()` and view a live inventory of every installed extension (including unpacked developer-mode extensions).
  - Screen-monitoring extensions capture real-time WebRTC video streams or periodic screenshots of the student's display. Even though this extension uses ultra-low-contrast (`rgba(0, 0, 0, 0.038)`) overlays and can be toggled off via `` ` `` or `Alt+H`, a screen recording captured while the popup is open or while "Fill All" automatically populates fields in sequence is visible on replay.

### 4. Third-Party Browser Proctoring Extensions (`Very High Detection`)
- Extensions such as **Proctorio**, **Honorlock**, **Examity**, and **Respondus LockDown Browser** detect this extension through multiple vectors:
  1. **Extension Enumeration**: They inspect installed extensions via `chrome.management` and require disabling all non-whitelisted extensions before starting an exam.
  2. **DOM Mutation Monitoring**: Content scripts injected by proctoring tools attach a `MutationObserver` to `document.body` and flag foreign classes/elements (such as `.gf-first-word-trigger`, `.gf-hint-option`, `.gf-ghost-answer`, and `.gf-sneaky-fill-bar`) injected into the assessment DOM.
  3. **Synthetic Input Detection**: When "Fill All" populates an `<input>` or `<textarea>`, it dispatches a single synthetic `InputEvent` (`event.isTrusted === false`) rather than a natural sequence of human `keydown` / `keyup` events with realistic inter-keystroke timing.

### 5. School Network / Firewall Inspection (`Medium–High Detection`)
- When connected to a school Wi-Fi or campus network:
  - Although the HTTPS payload is encrypted, DNS queries and TLS SNI headers reveal connections to **`generativelanguage.googleapis.com`** occurring at regular 4-second intervals during the exact window of the test.

### Summary Matrix

| Environment / Detection Vector | Can Teacher / Admin Detect It? | Why |
| :--- | :--- | :--- |
| **Standard Google Form on personal PC & home Wi-Fi** | **No (Directly)** / **Possible (Indirectly)** | Google Forms does not log DOM mutations or installed extensions, though identical AI free-text answers or fast submission times may raise suspicion. |
| **Physical classroom walk-by** | **Very Low** | Hints use a ~3.8% opacity light-gray tint (`rgba(0,0,0,0.038)`) and ghost text (`rgba(0,0,0,0.24)`), and pressing `` ` `` or `Alt+H` hides every visual element immediately. |
| **School Wi-Fi / Network Firewall** | **Yes (Network Logs)** | DNS and TLS SNI requests to `generativelanguage.googleapis.com` are visible to network admins. |
| **Managed Chrome Profile / GoGuardian / Hapara** | **Yes** | Admin & classroom tools enumerate all installed/unpacked extensions and stream the screen. |
| **Proctoring Software (Honorlock, Proctorio, Respondus)** | **Yes** | Blocks unknown extensions, detects DOM mutations, and flags `event.isTrusted === false` inputs. |
| **Google Forms Locked Mode (Chromebooks)** | **100% Blocked** | Disables all user extensions at the OS/browser level. |

---

## Features & Architecture

1. **Sneaky Per-Question Trigger (First Word Click)**:
   - On every question in a Google Form, the **first word** of the question heading (including any leading question number like `1. What`) is invisibly wired as an activation trigger with zero cursor or font changes.
   - **1st Click on First Word**: Sends the **full context of the entire form** (form title, description, all questions, options, and any already-resolved answers) to Gemini to solve **that single question** (`1 question = 1 model call`).
   - **2nd Click on First Word (or clicking the ghost text)**: Automatically selects/fills that single question's answer into the form.
2. **Ultra-Subtle Visual Indication**:
   - **Multiple Choice / Checkboxes / Linear Scale / Grids**: Applies a barely perceptible light-gray overlay (`rgba(0, 0, 0, 0.038)`) and a faint 2px inner left border to the correct option row(s).
   - **Short Answer / Paragraph / Dropdown**: Renders faint light-gray ghost text (`rgba(0, 0, 0, 0.24)`) inside the question area. Clicking the ghost text fills the input immediately.
3. **Instant Visibility Toggle Hotkey**:
   - Press `` ` `` (backtick, when not typing in a text field) or **`Alt+H`** (works anywhere, even while typing inside an input) to toggle all overlays, ghost text, and the bottom button completely on or off.
   - The single-key shortcut can be customized in the extension popup.
4. **Sneaky "Fill All" Button at the Bottom of the Form**:
   - At the bottom-right of the form (right below the Submit bar), a faint `· · ·` button blends into the footer. Double-clicking the footer disclaimer also triggers it.
   - Clicking it iterates through all questions on the form sequentially, making **one model call per question** with the **full form context**, respecting the **15 RPM rate limit**, and automatically filling all radio buttons, checkboxes, dropdowns, scales, grids, and text inputs.
5. **Strict 15 RPM Rate Limiter (`gemini-3.5-flash-lite`)**:
   - Configured to use `"gemini-3.5-flash-lite"` (with optional automatic 404 fallback to available Flash-Lite endpoints if your API key region hasn't enabled `gemini-3.5-flash-lite` yet).
   - Enforces a rolling 60-second sliding window (max 15 requests/minute) and 4,000ms steady pacing between queued requests in [`background.js`](file:///c:/code/answer-extension/background.js).

---

## Installation & Testing

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this folder (`c:\code\answer-extension`).
4. Click the **Forms Utility Helper** extension icon in your Chrome toolbar:
   - Paste your free **Gemini API Key** (from Google AI Studio).
   - Confirm the model is set to `gemini-3.5-flash-lite` and click **Save Settings**.
5. Open your test Google Form: https://forms.gle/i29S7UFn1EGTs2fN6
   - Click the **first word** of any question to discreetly fetch and display the light-gray hint for that question.
   - Press `` ` `` or `Alt+H` to toggle visibility of all hints on and off.
   - Click the faint `· · ·` button at the bottom-right of the form to solve and fill all questions sequentially within the 15 RPM limit.
