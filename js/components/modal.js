/**
 * COMPONENTE MODALES
 * ==================
 * Genera HTML para modales reutilizables
 */

const ModalsComponent = {
    /**
     * Renderiza el modal de justificaciones
     */
    renderJustificationModal() {
        return `
            <div id="justification-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-md w-full">
                        <h3 class="text-lg font-semibold mb-4">Agregar Justificación</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Estudiante: <span id="justification-student-name" class="font-semibold"></span>
                                </label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Tipo de Justificación</label>
                                <select id="justification-type" class="w-full border border-gray-300 rounded-md px-3 py-2">
                                    <option value="">Seleccionar...</option>
                                    <option value="Médica">Médica</option>
                                    <option value="Personal">Personal</option>
                                    <option value="Familiar">Familiar</option>
                                    <option value="Académica">Académica</option>
                                    <option value="Otra">Otra</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
                                <textarea 
                                    id="justification-description" 
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                                    placeholder="Detalles adicionales..."></textarea>
                            </div>
                        </div>
                        <div class="mt-6 flex gap-3">
                            <button onclick="AttendanceController.saveJustification()" class="btn btn-primary flex-1">
                                ✅ Guardar
                            </button>
                            <button onclick="AttendanceController.closeJustificationModal()" class="btn btn-neutral">
                                ❌ Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal para agregar estudiantes
     */
    renderAddStudentModal() {
        return `
            <div id="add-student-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-lg w-full max-h-90vh overflow-y-auto">
                        <h3 class="text-lg font-semibold mb-4">Agregar Estudiante de Otro Grupo</h3>
                        
                        <!-- Buscador -->
                        <div class="mb-4">
                            <input 
                                type="text" 
                                id="student-search" 
                                placeholder="Buscar por nombre o ID..."
                                class="w-full border border-gray-300 rounded-md px-3 py-2"
                                onkeyup="AttendanceController.filterAvailableStudents()"
                            />
                        </div>
                        
                        <!-- Lista de estudiantes disponibles -->
                        <div class="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                            <div id="available-students-list">
                                <!-- Se llena dinámicamente -->
                            </div>
                        </div>
                        
                        <div class="mt-6 flex gap-3">
                            <button onclick="AttendanceController.closeAddStudentModal()" class="btn btn-neutral flex-1">
                                ❌ Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza modal genérico de confirmación
     */
    renderConfirmationModal(id = 'confirmation-modal') {
        return `
            <div id="${id}" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-md w-full">
                        <div id="${id}-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="mt-6 flex gap-3">
                            <button id="${id}-confirm" class="btn btn-primary flex-1">
                                ✅ Confirmar
                            </button>
                            <button id="${id}-cancel" class="btn btn-neutral" onclick="ModalsController.close('${id}')">
                                ❌ Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza modal de vista previa
     */
    renderPreviewModal() {
        return `
            <div id="preview-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-90vh overflow-y-auto">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">Vista Previa</h3>
                            <button onclick="ModalsController.close('preview-modal')" class="text-gray-500 hover:text-gray-700">
                                ✕
                            </button>
                        </div>
                        <div id="preview-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="mt-6 text-right">
                            <button onclick="ModalsController.close('preview-modal')" class="btn btn-neutral">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza modal de loading
     */
    renderLoadingModal() {
        return `
            <div id="loading-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-8 text-center">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <h3 class="text-lg font-semibold mb-2" id="loading-title">Procesando...</h3>
                        <p class="text-gray-600" id="loading-message">Por favor espera...</p>
                    </div>
                </div>
            </div>
        `;
    }
};

/**
 * CONTROLADOR DE MODALES
 * ======================
 * Maneja la apertura y cierre de modales
 */
const ModalsController = {
    /**
     * Abre un modal
     */
    open(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.classList.add('no-scroll');
            
            // Auto-focus en el primer input si existe
            setTimeout(() => {
                const firstInput = modal.querySelector('input, textarea, select');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    },

    /**
     * Cierra un modal
     */
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
            
            // Limpiar formularios si existen
            const form = modal.querySelector('form');
            if (form) form.reset();
            
            // Limpiar inputs individuales
            const inputs = modal.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                if (input.type !== 'button' && input.type !== 'submit') {
                    input.value = '';
                }
            });
        }
    },

    /**
     * Muestra modal de confirmación
     */
    showConfirmation(title, message, onConfirm, confirmText = 'Confirmar', cancelText = 'Cancelar') {
        const modal = document.getElementById('confirmation-modal');
        const content = document.getElementById('confirmation-modal-content');
        const confirmBtn = document.getElementById('confirmation-modal-confirm');
        const cancelBtn = document.getElementById('confirmation-modal-cancel');
        
        if (modal && content && confirmBtn) {
            content.innerHTML = `
                <div class="text-center">
                    <h3 class="text-lg font-semibold mb-4">${title}</h3>
                    <p class="text-gray-600 mb-6">${message}</p>
                </div>
            `;
            
            confirmBtn.textContent = confirmText;
            if (cancelBtn) cancelBtn.textContent = cancelText;
            
            // Configurar evento de confirmación
            confirmBtn.onclick = () => {
                this.close('confirmation-modal');
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            };
            
            this.open('confirmation-modal');
        }
    },

    /**
     * Muestra modal de vista previa
     */
    showPreview(content) {
        const modal = document.getElementById('preview-modal');
        const contentDiv = document.getElementById('preview-content');
        
        if (modal && contentDiv) {
            contentDiv.innerHTML = content;
            this.open('preview-modal');
        }
    },

    /**
     * Muestra modal de loading
     */
    showLoading(title = 'Procesando...', message = 'Por favor espera...') {
        const modal = document.getElementById('loading-modal');
        const titleElement = document.getElementById('loading-title');
        const messageElement = document.getElementById('loading-message');
        
        if (modal) {
            if (titleElement) titleElement.textContent = title;
            if (messageElement) messageElement.textContent = message;
            
            modal.classList.remove('hidden');
            // No agregar no-scroll para loading, para que el fondo sea visible
        }
    },

    /**
     * Oculta modal de loading
     */
    hideLoading() {
        const modal = document.getElementById('loading-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
};

// Cerrar modales al hacer clic fuera
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('fixed') && event.target.classList.contains('inset-0')) {
        const modalId = event.target.id;
        if (modalId && modalId.includes('modal')) {
            ModalsController.close(modalId);
        }
    }
});

// Cerrar modales con Escape
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const visibleModals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        visibleModals.forEach(modal => {
            if (modal.id && modal.id.includes('modal')) {
                ModalsController.close(modal.id);
            }
        });
    }
});

debugLog('modals.js cargado correctamente');
