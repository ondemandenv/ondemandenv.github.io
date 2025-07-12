/**
 * Mermaid Enhanced - Standardized fullscreen, zoom, and pan functionality
 * Uses svg-pan-zoom and screenfull.js for robust diagram interaction
 */

class MermaidEnhanced {
    constructor() {
        this.panZoomInstances = new Map();
        this.currentFullscreenDiagram = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;
        console.log('MermaidEnhanced initialized');
    }

    enhanceAllDiagrams() {
        // Find all mermaid diagrams and enhance them
        const diagrams = document.querySelectorAll('.mermaid');
        diagrams.forEach((diagram, index) => {
            this.enhanceDiagram(diagram, index);
        });
    }

    enhanceDiagram(diagramElement, index) {
        const diagramId = diagramElement.id || `mermaid-diagram-${index}`;
        diagramElement.id = diagramId;

        // Create container wrapper
        const container = this.createDiagramContainer(diagramElement, diagramId);
        
        // Initialize pan/zoom after a short delay to ensure SVG is rendered
        setTimeout(() => {
            this.initializePanZoom(diagramId);
        }, 100);
    }

    createDiagramContainer(diagramElement, diagramId) {
        // Check if already wrapped
        if (diagramElement.closest('.diagram-container')) {
            return diagramElement.closest('.diagram-container');
        }

        // Create container wrapper
        const container = document.createElement('div');
        container.className = 'diagram-container';
        container.setAttribute('data-diagram-id', diagramId);

        // Create controls
        const controls = document.createElement('div');
        controls.className = 'diagram-controls';
        controls.innerHTML = `
            <button class="diagram-btn fullscreen-btn" title="Toggle Fullscreen">
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5z"/>
                    <path d="M.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5z"/>
                    <path d="M10.5 15a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4z"/>
                </svg>
                Fullscreen
            </button>
            <div class="zoom-controls">
                <button class="diagram-btn zoom-in-btn" title="Zoom In">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                    </svg>
                </button>
                <button class="diagram-btn zoom-out-btn" title="Zoom Out">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
                    </svg>
                </button>
                <button class="diagram-btn reset-btn" title="Reset View">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                </button>
            </div>
        `;

        // Insert container before diagram
        diagramElement.parentNode.insertBefore(container, diagramElement);
        container.appendChild(controls);
        container.appendChild(diagramElement);

        // Add event listeners
        this.attachControlListeners(container, diagramId);

        return container;
    }

    attachControlListeners(container, diagramId) {
        const fullscreenBtn = container.querySelector('.fullscreen-btn');
        const zoomInBtn = container.querySelector('.zoom-in-btn');
        const zoomOutBtn = container.querySelector('.zoom-out-btn');
        const resetBtn = container.querySelector('.reset-btn');

        fullscreenBtn.addEventListener('click', () => this.toggleFullscreen(diagramId));
        zoomInBtn.addEventListener('click', () => this.zoomIn(diagramId));
        zoomOutBtn.addEventListener('click', () => this.zoomOut(diagramId));
        resetBtn.addEventListener('click', () => this.resetView(diagramId));
    }

    initializePanZoom(diagramId) {
        const diagram = document.getElementById(diagramId);
        const svg = diagram.querySelector('svg');
        
        if (!svg || this.panZoomInstances.has(diagramId)) {
            return;
        }

        try {
            // Initialize svg-pan-zoom
            const panZoomInstance = svgPanZoom(svg, {
                zoomEnabled: true,
                controlIconsEnabled: false,
                fit: true,
                center: true,
                minZoom: 0.1,
                maxZoom: 10,
                zoomScaleSensitivity: 0.1,
                dblClickZoomEnabled: false,
                mouseWheelZoomEnabled: true
            });

            this.panZoomInstances.set(diagramId, panZoomInstance);
        } catch (error) {
            console.warn('Failed to initialize pan/zoom for diagram:', diagramId, error);
        }
    }

    toggleFullscreen(diagramId) {
        if (!window.screenfull || !window.screenfull.isEnabled) {
            console.warn('Fullscreen not supported');
            return;
        }

        const container = document.querySelector(`[data-diagram-id="${diagramId}"]`);
        
        if (window.screenfull.isFullscreen) {
            window.screenfull.exit();
        } else {
            container.classList.add('fullscreen-mode');
            this.currentFullscreenDiagram = diagramId;
            
            window.screenfull.request(container).then(() => {
                // Update controls for fullscreen mode
                this.updateFullscreenControls(diagramId, true);
            });
        }
    }

    updateFullscreenControls(diagramId, isFullscreen) {
        const container = document.querySelector(`[data-diagram-id="${diagramId}"]`);
        const fullscreenBtn = container.querySelector('.fullscreen-btn');
        
        if (isFullscreen) {
            fullscreenBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
                    <path d="M10.5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5z"/>
                    <path d="M0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5z"/>
                    <path d="M10 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-4z"/>
                </svg>
                Exit Fullscreen
            `;
        } else {
            fullscreenBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5z"/>
                    <path d="M.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5z"/>
                    <path d="M10.5 15a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4z"/>
                </svg>
                Fullscreen
            `;
        }
    }

    zoomIn(diagramId) {
        const instance = this.panZoomInstances.get(diagramId);
        if (instance) {
            instance.zoomIn();
        }
    }

    zoomOut(diagramId) {
        const instance = this.panZoomInstances.get(diagramId);
        if (instance) {
            instance.zoomOut();
        }
    }

    resetView(diagramId) {
        const instance = this.panZoomInstances.get(diagramId);
        if (instance) {
            instance.resetZoom();
            instance.resetPan();
        }
    }

    // Handle external diagram loading (for diagrams from /diagrams/ folder)
    async loadExternalDiagram(diagramElement, diagramUrl) {
        try {
            const response = await fetch(diagramUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const diagramContent = await response.text();
            const diagramId = 'mermaid-diagram-' + Date.now();
            
            const { svg } = await mermaid.render(diagramId, diagramContent);
            diagramElement.innerHTML = svg;
            
            // Enhance the loaded diagram
            this.enhanceDiagram(diagramElement, Date.now());
            
        } catch (error) {
            console.error('Failed to load external diagram:', error);
            diagramElement.innerHTML = `
                <div class="diagram-error">
                    <h4>Diagram Loading Failed</h4>
                    <p>Unable to load diagram from ${diagramUrl}</p>
                    <p class="error-detail">Error: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Initialize when libraries are loaded
function initMermaidEnhanced() {
    if (typeof svgPanZoom !== 'undefined' && typeof screenfull !== 'undefined') {
        const enhancer = new MermaidEnhanced();
        enhancer.init();
        
        // Make it globally available immediately
        window.MermaidEnhanced = enhancer;
        
        console.log('MermaidEnhanced initialized and available globally');
    } else {
        console.warn('svg-pan-zoom or screenfull not loaded, retrying...');
        setTimeout(initMermaidEnhanced, 100);
    }
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMermaidEnhanced);
} else {
    initMermaidEnhanced();
}