/**
 * ═══════════════════════════════════════════════════════════
 * NATURALFOOD - Main Entry Point
 * Agricultural Management Platform
 * 
 * Architecture: MVC (Model-View-Controller)
 * ═══════════════════════════════════════════════════════════
 */

import './styles/main.css';
import { AppController } from './controllers/AppController.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    app.init();
});
