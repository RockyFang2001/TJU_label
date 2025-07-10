import cv2
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import PolygonSelector
# 从图片数据中提取参数（使用优化后的值）
cam_matrix = np.array([
    [3700.086, 0, 2684.688],   # 焦距fx, 0, Cx
    [0, 3700.086, 1960.197],    # 0, 焦距fy, Cy
    [0, 0, 1]                   # 内参矩阵最后一行
])

dist_coeffs = np.array([
    0.003998099,    # K1
    -0.007239428,   # K2
    0.000374241,    # P1
    0.000162918,    # P2
    0.002083274     # K3
])

def replace_background_with_green(img):

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    lower_white = np.array([0, 0, 220])
    upper_white = np.array([180, 30, 255])
    mask_white = cv2.inRange(hsv, lower_white, upper_white)
    
    lower_black = np.array([0, 0, 0])
    upper_black = np.array([180, 255, 255])
    mask_black = cv2.inRange(hsv, lower_black, upper_black)
    
    mask_target = cv2.bitwise_or(mask_white, mask_black)
    
    kernel = np.ones((5, 5), np.uint8)
    mask_target = cv2.morphologyEx(mask_target, cv2.MORPH_CLOSE, kernel)
    mask_target = cv2.morphologyEx(mask_target, cv2.MORPH_OPEN, kernel)
    
    green_background = np.zeros_like(img)
    green_background[:] = [0, 125, 0]
    
    target_only = cv2.bitwise_and(img, img, mask=mask_target)
    
    mask_background = cv2.bitwise_not(mask_target)
    background_only = cv2.bitwise_and(green_background, green_background, mask=mask_background)
    
    return cv2.add(target_only, background_only)

def manual_region_selection(image):
    """手动选择棋盘格区域的四边形顶点"""
    fig, ax = plt.subplots(figsize=(12, 8))
    ax.imshow(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    plt.title("点击选择四边形顶点 (按顺序: 左上→右上→右下→左下)")
    plt.axis('on')
    
    polygon_coords = []
    
    def onselect(vertices):
        nonlocal polygon_coords
        polygon_coords = vertices
        plt.close()
    
    poly_selector = PolygonSelector(ax, onselect, useblit=True,
                                   lineprops=dict(color='red', linewidth=2),
                                   markerprops=dict(markersize=5))
    
    plt.tight_layout()
    plt.show()
    return polygon_coords

def auto_detect_corners(image, region_vertices):
    """自动检测棋盘格的25个关键点"""
    # 1. 裁剪感兴趣区域(ROI)
    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [np.array(region_vertices, dtype=np.int32)], 255)
    roi = cv2.bitwise_and(image, image, mask=mask)

    # 2. 灰度化和自适应二值化
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # 5. 在矫正后图像中检测棋盘格角点
    pattern_size = (3, 3)  # 4x4棋盘格有5x5个交点
    
    ret, corners = cv2.findChessboardCorners(gray, pattern_size, None)
    print(f"检测到的角点数量: {len(corners)}")
    if not ret:
        raise RuntimeError("无法自动检测棋盘格角点，请检查图像质量")
    
    # 精确定位角点
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
    refined_corners = cv2.cornerSubPix(gray, corners, (5, 5), (-1, -1), criteria)
    flattened_points = refined_corners.reshape(-1, 2)
    return flattened_points

def order_points(pts):
    """对点进行排序：左上→右上→右下→左下"""
    s = pts.sum(axis=1)
    ordered = np.zeros((4, 2), dtype='float32')
    
    # 左上点有最小和，右下点有最大和
    ordered[0] = pts[np.argmin(s)]
    ordered[2] = pts[np.argmax(s)]
    
    # 右上点有最小差值，左下点有最大差值
    diff = np.diff(pts, axis=1)
    ordered[1] = pts[np.argmin(diff)]
    ordered[3] = pts[np.argmax(diff)]
    
    return ordered

def visualize_results(original_img, selected_region, detected_points):
    """可视化结果"""
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    
    # 原始图像和选择的区域
    display_img = original_img.copy()
    cv2.polylines(display_img, [np.array(selected_region, np.int32)], True, (0, 0, 255), 3)
    axes[0].imshow(cv2.cvtColor(display_img, cv2.COLOR_BGR2RGB))
    axes[0].set_title('选择的棋盘格区域')
    axes[0].axis('off')
    
    # 检测到的角点（放大的ROI）
    roi_img = original_img.copy()
    for i, point in enumerate(detected_points):
        x, y = map(int, point)
        color = (0, 255, 0) if i < 20 else (255, 0, 0)  # 前20个点为绿色，后5个为蓝色
        cv2.circle(roi_img, (x, y), 6, color, -1)
        if i > 0 and i % 5 != 0:  # 绘制水平线
            prev_x, prev_y = map(int, detected_points[i-1])
            cv2.line(roi_img, (prev_x, prev_y), (x, y), (0, 255, 255), 2)
        if i >= 5:  # 绘制垂直线
            top_x, top_y = map(int, detected_points[i-5])
            cv2.line(roi_img, (top_x, top_y), (x, y), (255, 0, 255), 2)
    
    axes[1].imshow(cv2.cvtColor(roi_img, cv2.COLOR_BGR2RGB))
    axes[1].set_title('检测到的25个点（带网格）')
    axes[1].axis('off')
    
    # 透视变换后的棋盘格
    axes[2].imshow(cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB))
    axes[2].set_title('矫正后的棋盘格')
    axes[2].axis('off')
    
    plt.tight_layout()
    plt.show()

# 主流程
# if __name__ == "__main__":
#     # 1. 背景替换
#     image_path = "C:\\Users\\26067\\Desktop\\img\\zzzq.jpg"  # 替换为实际图像路径
#     img = cv2.imread(image_path)
#     if img is None:
#         raise ValueError("无法读取图像，请检查路径")
#     undistorted = cv2.undistort(img, cam_matrix, dist_coeffs)
#     processed_img = replace_background_with_green(undistorted)

#     # 2. 手动选择区域
#     roi_vertices = manual_region_selection(processed_img.copy())
    
#     if len(roi_vertices) < 4:
#         raise ValueError("请选择4个顶点来定义四边形区域")
    
#     print(f"选择的区域顶点坐标: {roi_vertices}")
    
#     # 3. 自动检测25个点
#     detected_points = auto_detect_corners(processed_img, roi_vertices)
    
#     # 4. 可视化结果
#     visualize_results(processed_img, roi_vertices, detected_points)
    
#     # 5. 保存检测点坐标
#     np.save('chessboard_points.npy', detected_points)
#     print(f"已保存9个点坐标到 chessboard_points.npy")
#     print(f"检测到的点坐标: {detected_points}")
#     # 6. 保存结果图像
#     result_img = processed_img.copy()
#     cv2.polylines(result_img, [np.array(roi_vertices, np.int32)], True, (0, 0, 255), 2)
#     for pt in detected_points:
#         cv2.circle(result_img, tuple(map(int, pt)), 5, (0, 255, 0), -1)
#     cv2.imwrite('final_result.jpg', result_img)
#     print("结果图像已保存为 final_result.jpg")