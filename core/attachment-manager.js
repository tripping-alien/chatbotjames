class AttachmentManager {
    constructor() {
        this.attachedFiles = [];
        this.onPreviewsUpdated = null; // Callback for UI
    }

    setupFileAttachment(attachButtonId, fileInputId, dropZoneId, appendErrorToChatCallback) {
        const attachButton = document.getElementById(attachButtonId);
        const fileInput = document.getElementById(fileInputId);
        
        if (attachButton && fileInput) {
            attachButton.addEventListener('click', () => {
                fileInput.click();
            });
            fileInput.addEventListener('change', (e) => {
                this.handleFilesSelected(e.target.files, appendErrorToChatCallback);
                fileInput.value = ''; // reset so same file can be selected again
            });
        }

        const dropZone = document.getElementById(dropZoneId);
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFilesSelected(e.dataTransfer.files, appendErrorToChatCallback);
                }
            });
        }
    }

    handleFilesSelected(files, appendErrorToChatCallback) {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                if (appendErrorToChatCallback) {
                    appendErrorToChatCallback(`⚠️ "${file.name}" is an image. James does not support image analysis yet. Please attach text files.`);
                }
                return;
            }
            if (file.size > 200 * 1024) { // 200KB limit
                if (appendErrorToChatCallback) {
                    appendErrorToChatCallback(`⚠️ "${file.name}" is too large (${(file.size/1024).toFixed(1)}KB). Please keep text files under 200KB.`);
                }
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const isProbablyBinary = /[\x00-\x08\x0E-\x1F]/.test(content.substring(0, 1000));
                
                if (isProbablyBinary) {
                    if (appendErrorToChatCallback) {
                        appendErrorToChatCallback(`⚠️ "${file.name}" appears to be a binary file (${file.type || 'unknown type'}). Only plain-text files can be attached. Try exporting as .txt or .csv.`);
                    }
                    return;
                }

                this.attachedFiles.push({
                    name: file.name,
                    content: content
                });
                if (this.onPreviewsUpdated) this.onPreviewsUpdated();
            };
            reader.readAsText(file);
        });
    }

    removeAttachment(index) {
        this.attachedFiles.splice(index, 1);
        if (this.onPreviewsUpdated) this.onPreviewsUpdated();
    }

    clearAttachments() {
        this.attachedFiles = [];
        if (this.onPreviewsUpdated) this.onPreviewsUpdated();
    }
}

export const attachmentManager = new AttachmentManager();
