import React from "react";
import { createRoot } from "react-dom/client";

import App from "./app.tsx";

// Render your React component instead
const root = createRoot(document.body);
root.render(<App />);
