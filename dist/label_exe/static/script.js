// 全局状态变量
let imageFiles = []; // 存储图像文件列表
let currentIndex = 0; // 当前显示图像的索引
let currentImage = new Image(); // 当前显示的图像对象
let currentGeoInfo = {}; // 当前图像的地理信息
let currentHeaderLines = []; // 当前图像的头部信息
let coordinates = []; // 存储标注的坐标，可能包含 null 值
let originalImageDimensions = { width: 0, height: 0 }; // 原始图像的尺寸

// 画布绘制相关的全局变量，单位为物理像素
let imageDrawInfo = { x: 0, y: 0, width: 0, height: 0, scale: 1 };

// 缩放相关的全局变量
let zoomScale = 1.0; // 用户缩放比例00000000000fv0000000000fv
const minZoomScale = 1.0; // 最小缩放比例
const maxZoomScale = 10.0; // 最大缩放比例
let panOffsetX = 0; // 拖拽偏移 X
let panOffsetY = 0; // 拖拽偏移 Y
let isPanning = false; // 是否正在拖拽
let lastPanX = 0; // 上次拖拽位置 X
let lastPanY = 0; // 上次拖拽位置 Y

// DOM 元素引用
const canvas = document.getElementById('image-canvas');
const ctx = canvas.getContext('2d');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const quitBtn = document.getElementById('quit-btn');
const currentImageNameSpan = document.getElementById('current-image-name');
const currentImageIndexSpan = document.getElementById('current-image-index');
const totalImagesSpan = document.getElementById('total-images');
const geoInfoDiv = document.getElementById('geo-info');
const coordinatesList = document.getElementById('coordinates-list');
const loadingSpinner = document.getElementById('loading-spinner');
const messageBox = document.getElementById('message-box');
const noImagePlaceholder = document.getElementById('no-image-placeholder');

// 显示消息通知
function showMessage(msg, type = 'success') {
    messageBox.textContent = msg;
    messageBox.className = 'fixed top-8 left-1/2 -translate-x-1/2 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform -translate-y-full opacity-0 transition-all duration-300 ease-out';
    messageBox.classList.add(type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500');
    void messageBox.offsetWidth;
    messageBox.classList.add('show');
    setTimeout(() => messageBox.classList.remove('show'), 3000);
}

// 更新画布大小和偏移量，支持缩放和平移
function updateCanvasSizeAndOffsets() {
    const parent = canvas.parentElement;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const cssCanvasWidth = parent.clientWidth - 12;
    const cssCanvasHeight = parent.clientHeight - 12;
    canvas.width = cssCanvasWidth * devicePixelRatio;
    canvas.height = cssCanvasHeight * devicePixelRatio;
    canvas.style.width = `${cssCanvasWidth}px`;
    canvas.style.height = `${cssCanvasHeight}px`;
    canvas.style.transform = '';
    canvas.style.top = '';
    canvas.style.left = '';
    canvas.style.position = '';

    const { width: imgOriginalWidth, height: imgOriginalHeight } = originalImageDimensions;
    if (!imgOriginalWidth || !imgOriginalHeight) {
        imageDrawInfo = { x: 0, y: 0, width: 0, height: 0, scale: 1 };
        noImagePlaceholder.classList.remove('hidden');
        return;
    }
    noImagePlaceholder.classList.add('hidden');

    const widthRatio = cssCanvasWidth / imgOriginalWidth;
    const heightRatio = cssCanvasHeight / imgOriginalHeight;
    const baseCssScale = Math.min(widthRatio, heightRatio);
    const cssScale = baseCssScale * zoomScale;
    const cssImgDrawWidth = imgOriginalWidth * cssScale;
    const cssImgDrawHeight = imgOriginalHeight * cssScale;
    const baseCssImgDrawX = (cssCanvasWidth - cssImgDrawWidth) / 2;
    const baseCssImgDrawY = (cssCanvasHeight - cssImgDrawHeight) / 2;
    const cssImgDrawX = baseCssImgDrawX + panOffsetX;
    const cssImgDrawY = baseCssImgDrawY + panOffsetY;

    imageDrawInfo = {
        x: cssImgDrawX * devicePixelRatio,
        y: cssImgDrawY * devicePixelRatio,
        width: cssImgDrawWidth * devicePixelRatio,
        height: cssImgDrawHeight * devicePixelRatio,
        scale: cssScale * devicePixelRatio
    };
    console.log("Image Draw Info (physical pixels):", imageDrawInfo, "Zoom:", zoomScale, "Pan:", panOffsetX, panOffsetY);
}

// 在画布上绘制当前图像
function drawImageOnCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (currentImage.src && imageDrawInfo.width > 0 && imageDrawInfo.height > 0) {
        ctx.drawImage(currentImage, imageDrawInfo.x, imageDrawInfo.y, imageDrawInfo.width, imageDrawInfo.height);
    }
}

// 绘制所有标注的坐标点
// function drawAnnotations() {
    // drawImageOnCanvas();
    // ctx.save();
    // ctx.strokeStyle = '#00008B';
    // ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    // ctx.font = `${16 * (window.devicePixelRatio || 1)}px Inter, sans-serif`;
    // ctx.fillStyle = '#00008B';
    // coordinates.forEach((coord, index) => {
    //     if (coord && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
    //         const canvasX = imageDrawInfo.x + coord[0] * imageDrawInfo.scale;
    //         const canvasY = imageDrawInfo.y + coord[1] * imageDrawInfo.scale;
    //         ctx.beginPath();
    //         ctx.moveTo(canvasX - (10 * (window.devicePixelRatio || 1)), canvasY);
    //         ctx.lineTo(canvasX + (10 * (window.devicePixelRatio || 1)), canvasY);
    //         ctx.moveTo(canvasX, canvasY - (10 * (window.devicePixelRatio || 1)));
    //         ctx.lineTo(canvasX, canvasY + (10 * (window.devicePixelRatio || 1)));
    //         ctx.stroke();
    //         // const targetText = coord[2] ? `靶标${coord[2]}` : '';
    //         const targetText = coord[2] ? `${coord[2]}` : '';
    //         const coordText = `${targetText}`;
    //         ctx.fillText(coordText, canvasX + (15 * (window.devicePixelRatio || 1)), canvasY - (5 * (window.devicePixelRatio || 1)));
    //     }
    // });
    // ctx.restore();
// }

// 更新 UI 显示的图像信息、元数据和坐标列表
function updateUI() {
    currentImageNameSpan.textContent = imageFiles[currentIndex] || 'N/A';
    currentImageIndexSpan.textContent = currentIndex + 1;
    totalImagesSpan.textContent = imageFiles.length;

    const formatValue = (value, fixed = 2) => {
        if ([null, undefined, ''].includes(value)) return 'N/A';
        const numValue = parseFloat(value);
        return isNaN(numValue) ? (typeof value === 'string' && value.trim() ? value : 'N/A') : numValue.toFixed(fixed);
    };

    document.getElementById('info-filename').textContent = imageFiles[currentIndex] || 'N/A';
    document.getElementById('info-latitude').textContent = formatValue(currentGeoInfo.Latitude, 6);
    document.getElementById('info-longitude').textContent = formatValue(currentGeoInfo.Longitude, 6);
    document.getElementById('info-altitude').textContent = formatValue(currentGeoInfo.Altitude, 2) + ' meters';
    document.getElementById('info-gimbal-roll').textContent = formatValue(currentGeoInfo.GimbalRoll, 2) + '°';
    document.getElementById('info-gimbal-pitch').textContent = formatValue(currentGeoInfo.GimbalPitch, 2) + '°';
    document.getElementById('info-gimbal-yaw').textContent = formatValue(currentGeoInfo.GimbalYaw, 2) + '°';

    coordinatesList.innerHTML = '';
    const hasActualMarks = coordinates.some(coord => coord !== null);
    if (!hasActualMarks && coordinates.length <= 1 && coordinates[0] === null) {
        const li = document.createElement('li');
        li.textContent = '无标记点';
        coordinatesList.appendChild(li);
    } else {
        coordinates.forEach((coord, idx) => {
            const li = document.createElement('li');
            if (coord) {
                li.textContent = `靶标 ${coord[2]}: (X: ${coord[0]}, Y: ${coord[1]})`;
            } else {
                li.textContent = `靶标 ${idx + 1}: (X: none, Y: none)`;
            }
            coordinatesList.appendChild(li);
        });
    }
}

// 保存当前图像的坐标和头部信息到后端
async function saveCoordinates() {
    let coordsToSend = coordinates;
    const hasActualMarks = coordinates.some(coord => coord !== null);
    if (!hasActualMarks && (coordinates.length === 0 || coordinates.every(c => c === null))) {
        coordsToSend = [null];
    }
    loadingSpinner.classList.remove('hidden');
    try {
        const response = await fetch(`/api/save_coordinates/${currentIndex}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ header_lines: currentHeaderLines, coordinates: coordsToSend })
        });
        if (!response.ok) {
            throw new Error(`HTTP Error! Status Code: ${response.status}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        // showMessage(result.message, 'success');
    } catch (error) {
        showMessage(`保存坐标失败: ${error.message}`, 'error');
        console.error('Error saving coordinates:', error);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// 页面关闭前向后端发送退出请求
window.addEventListener('beforeunload', function(e) {
    fetch('http://localhost:5000/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shutdown' })
    });
    e.preventDefault();
    e.returnValue = '';
});

// 加载指定索引的图像数据、元数据和坐标
async function loadImage(index) {
    if (!imageFiles.length) {
        showMessage('未找到图像文件。请将图像放入指定文件夹。', 'info');
        loadingSpinner.classList.add('hidden');
        noImagePlaceholder.classList.remove('hidden');
        return;
    }
    if (index < 0) {
        currentIndex = imageFiles.length - 1;
    } else if (index >= imageFiles.length) {
        currentIndex = 0;
    } else {
        currentIndex = index;
    }
    loadingSpinner.classList.remove('hidden');
    noImagePlaceholder.classList.add('hidden');
    try {
        const response = await fetch(`/api/image/${currentIndex}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP 错误! 状态码: ${response.status}. 详情: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        currentImage.src = `data:image/jpeg;base64,${data.image_data}`;
        currentGeoInfo = data.geo_info;
        currentHeaderLines = data.header_lines;
        coordinates = data.coordinates;
        originalImageDimensions = data.original_dimensions;
        currentImage.onload = () => {
            zoomScale = 1.0;
            panOffsetX = 0;
            panOffsetY = 0;
            updateCanvasSizeAndOffsets();
            drawAnnotations();
            updateUI();
            loadingSpinner.classList.add('hidden');
            showMessage('图像加载成功！', 'success');
        };
        currentImage.onerror = () => {
            loadingSpinner.classList.add('hidden');
            showMessage('图像加载失败。', 'error');
            console.error('Image element failed to load.');
            noImagePlaceholder.classList.remove('hidden');
        };
    } catch (error) {
        loadingSpinner.classList.add('hidden');
        showMessage(`加载图像数据失败: ${error.message}`, 'error');
        console.error('Error loading image data:', error);
        noImagePlaceholder.classList.remove('hidden');
    }
}

// 上一张图像导航函数
async function navigateImage_prevBtn(delta) {
    await saveCoordinates();
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) {
        nextIndex = imageFiles.length - 1;
    } else if (nextIndex >= imageFiles.length) {
        nextIndex = 0;
    }
    coordinates = [];
    await loadImage(nextIndex);
}

// 下一张图像导航函数，显示模态框确认
async function navigateImage_nextBtn(delta) {
    const elementCount = {};
    coordinates.forEach(coord => {
        if (coord && typeof coord[2] === 'number') {
            const element = coord[2];
            elementCount[element] = (elementCount[element] || 0) + 1;
        }
    });

    const modal = document.createElement('div');
    modal.classList.add('fixed', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'bg-white', 'p-6', 'rounded-lg', 'shadow-lg', 'z-50', 'transform', 'opacity-0', 'transition-all', 'duration-300', 'ease-out');

    const content = document.createElement('div');
    for (const [element, count] of Object.entries(elementCount)) {
        const p = document.createElement('p');
        p.textContent = `靶标${element}, 标注数量 ${count}`;
        p.classList.add('mb-2', 'text-gray-700');
        content.appendChild(p);
    }
    modal.appendChild(content);

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('flex', 'justify-end', 'mt-4');

    const confirmButton = document.createElement('button');
    confirmButton.textContent = '确定';
    confirmButton.classList.add('px-4', 'py-2', 'bg-green-500', 'text-white', 'rounded-md', 'mr-2', 'hover:bg-green-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-green-400', 'focus:ring-opacity-50');
    confirmButton.addEventListener('click', async () => {
        await saveCoordinates();
        let nextIndex = currentIndex + delta;
        if (nextIndex < 0) {
            nextIndex = imageFiles.length - 1;
        } else if (nextIndex >= imageFiles.length) {
            nextIndex = 0;
        }
        coordinates = [];
        await loadImage(nextIndex);
        modal.remove();
    });
    buttonContainer.appendChild(confirmButton);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.classList.add('px-4', 'py-2', 'bg-red-500', 'text-white', 'rounded-md', 'hover:bg-red-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-red-400', 'focus:ring-opacity-50');
    cancelButton.addEventListener('click', () => modal.remove());
    buttonContainer.appendChild(cancelButton);

    modal.appendChild(buttonContainer);
    document.body.appendChild(modal);
    void modal.offsetWidth;
    modal.classList.add('opacity-100');
}
// // 合并的鼠标按下事件处理器，处理左键标注和中键拖拽
// canvas.addEventListener('mousedown', async (event) => {
//     if (event.button === 1) { // 鼠标中键按钮代码为 1
//         event.preventDefault();
//         isPanning = true;
//         lastPanX = event.clientX;
//         lastPanY = event.clientY;
//         canvas.style.cursor = 'move';
//         return;
//     }
//     if (event.button === 2) { // 鼠标右键删除标记
//         if (coordinates.length > 0 && !(coordinates.length === 1 && coordinates[0] === null)) {
//             const rect = canvas.getBoundingClientRect();
//             const devicePixelRatio = window.devicePixelRatio || 1;
//             const clickCanvasX = (event.clientX - rect.left) * devicePixelRatio;
//             const clickCanvasY = (event.clientY - rect.top) * devicePixelRatio;
//
//             let minDistance = Infinity;
//             let closestIndex = -1;
//
//             coordinates.forEach((coord, index) => {
//                 if (coord && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
//                     const canvasX = imageDrawInfo.x + coord[0] * imageDrawInfo.scale;
//                     const canvasY = imageDrawInfo.y + coord[1] * imageDrawInfo.scale;
//                     const distance = Math.sqrt((canvasX - clickCanvasX) ** 2 + (canvasY - clickCanvasY) ** 2);
//                     if (distance < minDistance) {
//                         minDistance = distance;
//                         closestIndex = index;
//                     }
//                 }
//             });
//
//             if (closestIndex !== -1) {
//                 coordinates.splice(closestIndex, 1);
//                 if (coordinates.length === 0) {
//                     coordinates.push(null);
//                 }
//                 drawAnnotations();
//                 await saveCoordinates();
//                 updateUI();
//                 showMessage('距离最近的标记已删除。', 'info');
//             }
//         } else {
//             showMessage('没有可删除的标记。', 'info');
//         }
//         return;
//     }
//     if (event.button !== 0) return;
//
//     const rect = canvas.getBoundingClientRect();
//     const devicePixelRatio = window.devicePixelRatio || 1;
//     const clickCanvasX = (event.clientX - rect.left) * devicePixelRatio;
//     const clickCanvasY = (event.clientY - rect.top) * devicePixelRatio;
//
//     const isClickInsideImageDrawArea =
//         clickCanvasX >= imageDrawInfo.x &&
//         clickCanvasX <= (imageDrawInfo.x + imageDrawInfo.width) &&
//         clickCanvasY >= imageDrawInfo.y &&
//         clickCanvasY <= (imageDrawInfo.y + imageDrawInfo.height);
//
//     if (isClickInsideImageDrawArea) {
//         const imgX = Math.round((clickCanvasX - imageDrawInfo.x) / imageDrawInfo.scale);
//         const imgY = Math.round((clickCanvasY - imageDrawInfo.y) / imageDrawInfo.scale);
//         if (imgX >= 0 && imgX < originalImageDimensions.width &&
//             imgY >= 0 && imgY < originalImageDimensions.height) {
//             const targetNumber = prompt('请输入靶标编号 (数字):');
//             if (targetNumber === null) {
//                 // showMessage('标注已取消', 'info');
//                 return;
//             }
//             const targetNum = parseInt(targetNumber);
//             if (isNaN(targetNum) || targetNum <= 0 || targetNum > 9) {
//                 showMessage('请输入在范围1~9的整数', 'error');
//                 return;
//             }
//             if (coordinates.length === 1 && coordinates[0] === null) {
//                 coordinates = [];
//             }
//             coordinates.push([imgX, imgY, targetNum]);
//             drawAnnotations();
//             await saveCoordinates();
//             updateUI();
//             // showMessage(`坐标已记录: X ${imgX}, Y ${imgY}, 靶标 ${targetNum}`, 'success');
//         } else {
//             showMessage('点击位置超出图片边界。', 'info');
//         }
//     } else {
//         showMessage('点击区域不在图像内。请直接点击图像。', 'info');
//     }
// });
// 新增全局变量
// 新增变量，用于标记是否处于绘制矩形框模式

let isDrawingRectangle = false;
let rectangleStart = null;
let rectangleEnd = null;

// 键盘快捷键事件添加绘制矩形框的快捷键
document.addEventListener('keydown', (event) => {
    if (event.key === 'z' || event.key === 'Z') {
        undoBtn.click();
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevBtn.click();
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextBtn.click();
    } else if (event.key === 'q' || event.key === 'Q') {
        quitBtn.click();
    } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        zoomScale = 1.0;
        panOffsetX = 0;
        panOffsetY = 0;
        updateCanvasSizeAndOffsets();
        drawAnnotations();
        showMessage('缩放和平移已重置', 'info');
    } else if (event.key === 'm' || event.key === 'M') { // 新增快捷键 M 进入绘制矩形框模式
        if( isDrawingRectangle == true){
            isDrawingRectangle = false;
            showMessage('退出绘制矩形框模式', 'info');
        } else {
            isDrawingRectangle = true;
            showMessage('进入绘制矩形框模式，按住左键绘制矩形', 'info');
        }
    }
});

// 修改鼠标按下事件处理器，添加绘制矩形框逻辑
canvas.addEventListener('mousedown', async (event) => {
    if (isDrawingRectangle && event.button === 0) { // 左键且处于绘制矩形框模式
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        rectangleStart = [
            (event.clientX - rect.left) * devicePixelRatio,
            (event.clientY - rect.top) * devicePixelRatio
        ];
        return;
    }

    if (event.button === 1) { // 鼠标中键按钮代码为 1
        event.preventDefault();
        isPanning = true;
        lastPanX = event.clientX;
        lastPanY = event.clientY;
        canvas.style.cursor = 'move';
        return;
    }
    if (event.button === 2) { // 鼠标右键删除标记
        if (coordinates.length > 0 && !(coordinates.length === 1 && coordinates[0] === null)) {
            const rect = canvas.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;
            const clickCanvasX = (event.clientX - rect.left) * devicePixelRatio;
            const clickCanvasY = (event.clientY - rect.top) * devicePixelRatio;

            let minDistance = Infinity;
            let closestIndex = -1;

            coordinates.forEach((coord, index) => {
                if (coord && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                    const canvasX = imageDrawInfo.x + coord[0] * imageDrawInfo.scale;
                    const canvasY = imageDrawInfo.y + coord[1] * imageDrawInfo.scale;
                    const distance = Math.sqrt((canvasX - clickCanvasX) ** 2 + (canvasY - clickCanvasY) ** 2);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestIndex = index;
                    }
                }
            });

            if (closestIndex !== -1) {
                coordinates.splice(closestIndex, 1);
                if (coordinates.length === 0) {
                    coordinates.push(null);
                }
                drawAnnotations();
                await saveCoordinates();
                updateUI();
                showMessage('距离最近的标记已删除。', 'info');
            }
        } else {
            showMessage('没有可删除的标记。', 'info');
        }
        return;
    }
    if (event.button !== 0) return;

    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const clickCanvasX = (event.clientX - rect.left) * devicePixelRatio;
    const clickCanvasY = (event.clientY - rect.top) * devicePixelRatio;

    const isClickInsideImageDrawArea =
        clickCanvasX >= imageDrawInfo.x &&
        clickCanvasX <= (imageDrawInfo.x + imageDrawInfo.width) &&
        clickCanvasY >= imageDrawInfo.y &&
        clickCanvasY <= (imageDrawInfo.y + imageDrawInfo.height);

    if (isClickInsideImageDrawArea) {
        const imgX = Math.round((clickCanvasX - imageDrawInfo.x) / imageDrawInfo.scale);
        const imgY = Math.round((clickCanvasY - imageDrawInfo.y) / imageDrawInfo.scale);
        if (imgX >= 0 && imgX < originalImageDimensions.width &&
            imgY >= 0 && imgY < originalImageDimensions.height) {
            const targetNumber = prompt('请输入靶标编号 (数字):');
            if (targetNumber === null) {
                return;
            }
            const targetNum = parseInt(targetNumber);
            if (isNaN(targetNum) || targetNum <= 0 || targetNum > 9) {
                showMessage('请输入在范围1~9的整数', 'error');
                return;
            }
            if (coordinates.length === 1 && coordinates[0] === null) {
                coordinates = [];
            }
            coordinates.push([imgX, imgY, targetNum]);
            drawAnnotations();
            await saveCoordinates();
            updateUI();
        } else {
            showMessage('点击位置超出图片边界。', 'info');
        }
    } else {
        showMessage('点击区域不在图像内。请直接点击图像。', 'info');
    }
});

// 鼠标移动事件，绘制矩形框
canvas.addEventListener('mousemove', (event) => {
    if (isDrawingRectangle && rectangleStart) {
        const rect = canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        rectangleEnd = [
            (event.clientX - rect.left) * devicePixelRatio,
            (event.clientY - rect.top) * devicePixelRatio
        ];
        drawAnnotations(); // 重新绘制标注，包含矩形框
    }

    if (isPanning) {
        event.preventDefault();
        const deltaX = event.clientX - lastPanX;
        const deltaY = event.clientY - lastPanY;
        panOffsetX += deltaX;
        panOffsetY += deltaY;
        lastPanX = event.clientX;
        lastPanY = event.clientY;
        updateCanvasSizeAndOffsets();
        drawAnnotations();
    }
});

// 鼠标释放事件，结束绘制矩形框并发送数据到后端
canvas.addEventListener('mouseup', async (event) => {
    if (isDrawingRectangle && event.button === 0 && rectangleStart && rectangleEnd) {

        const targetNumber = prompt('请输入靶标编号 (数字):');
        if (targetNumber === null) {
            return;
        }
        const targetNum = parseInt(targetNumber);
        if (isNaN(targetNum) || targetNum <= 0 || targetNum > 9) {
            showMessage('请输入在范围1~9的整数', 'error');
            return;
        }
        if (coordinates.length === 1 && coordinates[0] === null) {
            coordinates = [];
        }



        // isDrawingRectangle = false;
        const imgRectStart = [
            Math.round((rectangleStart[0] - imageDrawInfo.x) / imageDrawInfo.scale),
            Math.round((rectangleStart[1] - imageDrawInfo.y) / imageDrawInfo.scale)
        ];
        const imgRectEnd = [
            Math.round((rectangleEnd[0] - imageDrawInfo.x) / imageDrawInfo.scale),
            Math.round((rectangleEnd[1] - imageDrawInfo.y) / imageDrawInfo.scale)
        ];

        try {
            const response = await fetch('/api/process_rectangle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rectangle: [imgRectStart, imgRectEnd] })
            });
            if (!response.ok) {
                throw new Error(`HTTP Error! Status Code: ${response.status}`);
            }
            const result = await response.json();
            coordinatesList.innerHTML = '';
            result.forEach((coord) => {
                const li = document.createElement('li');
                li.textContent = `靶标 ${targetNum}: (X: ${coord[0]}, Y: ${coord[1]})`;
                coordinates.push([coord[0], coord[1], targetNum]);
                coordinatesList.appendChild(li);
            });
            drawAnnotations();
            await saveCoordinates();
            updateUI();

            showMessage('矩形框数据处理成功', 'success');
        } catch (error) {
            showMessage(`处理矩形框数据失败: ${error.message}`, 'error');
            console.error('Error processing rectangle data:', error);
        }

        rectangleStart = null;
        rectangleEnd = null;
        drawAnnotations(); // 重新绘制标注，移除矩形框
    }

    if (event.button === 1) { // 鼠标中键按钮代码为 1
        isPanning = false;
        canvas.style.cursor = 'crosshair';
    }
    if (event.button === 2) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
    }
});

// 修改 drawAnnotations 函数，添加绘制矩形框逻辑
function drawAnnotations() {
    // 原有的绘制标注逻辑...
drawImageOnCanvas();
    ctx.save();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.font = `${16 * (window.devicePixelRatio || 1)}px Inter, sans-serif`;
    ctx.fillStyle = '#00FF00';
    coordinates.forEach((coord, index) => {
        if (coord && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
            const canvasX = imageDrawInfo.x + coord[0] * imageDrawInfo.scale;
            const canvasY = imageDrawInfo.y + coord[1] * imageDrawInfo.scale;
            ctx.beginPath();
            ctx.moveTo(canvasX - (10 * (window.devicePixelRatio || 1)), canvasY);
            ctx.lineTo(canvasX + (10 * (window.devicePixelRatio || 1)), canvasY);
            ctx.moveTo(canvasX, canvasY - (10 * (window.devicePixelRatio || 1)));
            ctx.lineTo(canvasX, canvasY + (10 * (window.devicePixelRatio || 1)));
            ctx.stroke();
            // const targetText = coord[2] ? `靶标${coord[2]}` : '';
            const targetText = coord[2] ? `${coord[2]}` : '';
            const coordText = `${targetText}`;
            ctx.fillText(coordText, canvasX + (15 * (window.devicePixelRatio || 1)), canvasY - (5 * (window.devicePixelRatio || 1)));
        }
    });
    ctx.restore();
    if (isDrawingRectangle && rectangleStart && rectangleEnd) {
        ctx.beginPath();
        ctx.rect(rectangleStart[0], rectangleStart[1], rectangleEnd[0] - rectangleStart[0], rectangleEnd[1] - rectangleStart[1]);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}





// 禁用右键菜单
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('contextmenu', function(event) {
    event.preventDefault(); // 阻止默认右键菜单
    // 若需要自定义右键菜单，可在此处编写逻辑（如显示自定义弹窗）
});

// 导航按钮事件
prevBtn.addEventListener('click', () => navigateImage_prevBtn(-1));
nextBtn.addEventListener('click', () => navigateImage_nextBtn(1));

// 撤销按钮事件
undoBtn.addEventListener('click', async () => {
    if (coordinates.length > 0 && !(coordinates.length === 1 && coordinates[0] === null)) {
        coordinates.pop();
        if (coordinates.length === 0) {
            coordinates.push(null);
        }
        drawAnnotations();
        await saveCoordinates();
        updateUI();
        showMessage('最后标记已撤销。', 'info');
    } else {
        showMessage('没有可撤销的标记。', 'info');
    }
});

// 清除所有标记按钮事件
let clearAllMarksHandler;
clearAllMarksHandler = async () => {
    showMessage('您确定要清除当前图像的所有标记吗？再次点击"清除所有标记"以确认。', 'info');
    clearBtn.onclick = async () => {
        coordinates = [null];
        drawAnnotations();
        await saveCoordinates();
        updateUI();
        showMessage('所有标记已清除。', 'success');
        clearBtn.onclick = clearAllMarksHandler;
    };
    setTimeout(() => {
        if (clearBtn.onclick !== clearAllMarksHandler) {
            clearBtn.onclick = clearAllMarksHandler;
            showMessage('清除操作已取消。', 'info');
        }
    }, 5000);
};
clearBtn.addEventListener('click', clearAllMarksHandler);

// 退出按钮事件
let originalQuitHandler;
originalQuitHandler = () => {
    showMessage('您确定要退出吗？所有未保存的更改将丢失（标记会自动保存）。再次点击"退出"以确认。', 'info');
    quitBtn.onclick = () => {
        window.close();
        showMessage('已退出。', 'success');
    };
    setTimeout(() => {
        if (quitBtn.onclick !== originalQuitHandler) {
            quitBtn.onclick = originalQuitHandler;
            showMessage('退出操作已取消。', 'info');
        }
    }, 5000);
};
quitBtn.addEventListener('click', originalQuitHandler);

// 键盘快捷键事件
document.addEventListener('keydown', (event) => {
    if (event.key === 'z' || event.key === 'Z') {
        undoBtn.click();
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevBtn.click();
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextBtn.click();
    } else if (event.key === 'q' || event.key === 'Q') {
        quitBtn.click();
    } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        zoomScale = 1.0;
        panOffsetX = 0;
        panOffsetY = 0;
        updateCanvasSizeAndOffsets();
        drawAnnotations();
        showMessage('缩放和平移已重置', 'info');
    }
});

// 窗口大小改变事件，保持画布响应式
window.addEventListener('resize', () => {
    if (currentImage.src) {
        updateCanvasSizeAndOffsets();
        drawAnnotations();
    }
});

// 初始化事件监听器
function initEventListeners() {
    console.log('Initializing event listeners... (Version 1.1 - Zoom Support)');
    console.log('缩放功能版本：1.1 - 支持鼠标滚轮缩放');

    canvas.addEventListener('wheel', (event) => {
        console.log('Wheel event triggered!', event.deltaY);
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasMouseX = mouseX * devicePixelRatio;
        const canvasMouseY = mouseY * devicePixelRatio;
        const imageMouseX = (canvasMouseX - imageDrawInfo.x) / imageDrawInfo.scale;
        const imageMouseY = (canvasMouseY - imageDrawInfo.y) / imageDrawInfo.scale;
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoomScale = Math.max(minZoomScale, Math.min(maxZoomScale, zoomScale * zoomFactor));
        if (newZoomScale !== zoomScale) {
            const oldZoomScale = zoomScale;
            zoomScale = newZoomScale;
            console.log('Zoom scale changed to:', zoomScale);
            updateCanvasSizeAndOffsets();
            if (imageMouseX >= 0 && imageMouseX <= originalImageDimensions.width &&
                imageMouseY >= 0 && imageMouseY <= originalImageDimensions.height) {
                const newCanvasMouseX = imageDrawInfo.x + imageMouseX * imageDrawInfo.scale;
                const newCanvasMouseY = imageDrawInfo.y + imageMouseY * imageDrawInfo.scale;
                const deltaX = (canvasMouseX - newCanvasMouseX) / devicePixelRatio;
                const deltaY = (canvasMouseY - newCanvasMouseY) / devicePixelRatio;
                panOffsetX += deltaX;
                panOffsetY += deltaY;
                updateCanvasSizeAndOffsets();
            }
            drawAnnotations();
        }
    });
    console.log('Event listeners initialized successfully!');
}

// 初始化函数
async function init() {
    console.log('Starting initialization...');
    loadingSpinner.classList.remove('hidden');
    noImagePlaceholder.classList.add('hidden');
    initEventListeners();
    try {
        const response = await fetch('/api/images');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP 错误! 状态码: ${response.status}. 详情: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        imageFiles = data;
        if (imageFiles.length > 0) {
            await loadImage(0);
        } else {
            showMessage('未找到图像文件。请将图像放入指定文件夹。', 'error');
            loadingSpinner.classList.add('hidden');
            noImagePlaceholder.classList.remove('hidden');
            currentImageNameSpan.textContent = 'N/A';
            currentImageIndexSpan.textContent = '0';
            totalImagesSpan.textContent = '0';
            document.getElementById('info-filename').textContent = 'N/A';
            document.getElementById('info-latitude').textContent = 'N/A';
            document.getElementById('info-longitude').textContent = 'N/A';
            document.getElementById('info-altitude').textContent = 'N/A';
            document.getElementById('info-gimbal-roll').textContent = 'N/A';
            document.getElementById('info-gimbal-pitch').textContent = 'N/A';
            document.getElementById('info-gimbal-yaw').textContent = 'N/A';
            coordinatesList.innerHTML = '<li>无标记点</li>';
            updateCanvasSizeAndOffsets();
            drawImageOnCanvas();
        }
    } catch (error) {
        showMessage(`初始化失败: ${error.message}`, 'error');
        console.error('Initialization error:', error);
        loadingSpinner.classList.add('hidden');
        noImagePlaceholder.classList.remove('hidden');
    }
}

init(); // 启动应用程序初始化过程