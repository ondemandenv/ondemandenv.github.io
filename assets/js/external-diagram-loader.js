/**
 * External Diagram Loader Helper
 * Simplifies loading external mermaid diagrams from /diagrams/ folder
 */

function loadExternalDiagram(containerId, diagramPath) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return;
    }

    // Add loading state
    container.innerHTML = '<div class="diagram-loading">Loading diagram...</div>';

    // Wait for MermaidEnhanced to be available
    function tryLoadDiagram() {
        if (window.MermaidEnhanced) {
            window.MermaidEnhanced.loadExternalDiagram(container, diagramPath);
        } else {
            // Retry after a short delay
            setTimeout(tryLoadDiagram, 100);
        }
    }

    tryLoadDiagram();
}

// Automatically load external diagrams marked with data attributes
document.addEventListener('DOMContentLoaded', function() {
    const externalDiagrams = document.querySelectorAll('[data-external-diagram]');
    externalDiagrams.forEach(container => {
        const diagramPath = container.getAttribute('data-external-diagram');
        loadExternalDiagram(container.id, diagramPath);
    });
});

// Make function available globally
window.loadExternalDiagram = loadExternalDiagram;