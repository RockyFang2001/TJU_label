from ultralytics import YOLO
import cv2
import os
import json
import numpy as np
import get_cheese_point as gp
import label_exe as le
from collections import defaultdict
import math
# 从图片数据中提取参数（使用优化后的值）
cam_matrix = np.array([
    [3713.803, 0, 2684.996],   # 焦距fx, 0, Cx
    [0, 3713.803, 1953.359],    # 0, 焦距fy, Cy
    [0, 0, 1]                   # 内参矩阵最后一行
])

dist_coeffs = np.array([
    0.008207496,    # K1
    -0.018350467,   # K2
    0.00012171,    # P1
    0.000062393,    # P2
    0.011509733     # K3
])

# 1. 加载模型
model = YOLO("/home/fkr/ultralytics/runs/detect/train17/weights/best.pt")  # 替换为你的模型权重路径

# 2. 指定测试数据集路径
test_dataset_path = "/media/fkr/TJU_AIR/7112/1"  # 替换为你的测试数据集路径
output_results = 0
no_handle_list = []
# 3. 处理每张测试图片
for img_name in os.listdir(test_dataset_path):
    if not img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
        continue
        
    img_path = os.path.join(test_dataset_path, img_name)
    txt_name = img_name.replace('JPG','txt')
    txt_path = os.path.join(test_dataset_path, txt_name)
    current_geo_info = le.extract_geo_info(img_path)
    header, coordinates = le.read_text_file(txt_path)
    frame = cv2.imread(img_path)

    # 创建显示图像副本
    display_img = frame.copy()

    if not os.path.exists(txt_path) or os.path.getsize(txt_path) == 0 or len(header) < 8:
        initial_header = [
            f"Filename: {img_name}\n",
            f"Latitude: {current_geo_info['Latitude'] if current_geo_info['Latitude'] is not None else 'N/A'}\n",
            f"Longitude: {current_geo_info['Longitude'] if current_geo_info['Longitude'] is not None else 'N/A'}\n",
            f"Altitude: {current_geo_info['Altitude'] if current_geo_info['Altitude'] is not None else 'N/A'} meters\n",
            "Gimbal Orientation:\n",
            f"  Roll:  {current_geo_info['GimbalRoll'] if current_geo_info['GimbalRoll'] is not None else 'N/A'}°\n",
            f"  Pitch: {current_geo_info['GimbalPitch'] if current_geo_info['GimbalPitch'] is not None else 'N/A'}°\n",
            f"  Yaw:   {current_geo_info['GimbalYaw'] if current_geo_info['GimbalYaw'] is not None else 'N/A'}°\n",
            "\n"
        ]
        print(f"Debug: 为 {img_name} 重新初始化TXT文件")
    # 4. 进行目标检测
    results = model.predict(source=frame, 
                            conf=0.25,  # 置信度阈值
                            iou=0.45,   # IOU阈值
                            save=False,  # 不保存结果图片
                            verbose=False)  # 不打印详情
    
    # 5. 提取检测框信息
    ans_point = []
    index = 0
    for result in results:
        
        # 获取所有检测结果
        detections = result.boxes
        
        # 提取每个检测框的信息
        for box in detections:
            index += 1
            # 获取像素坐标 (xyxy格式: [左上x, 左上y, 右下x, 右下y])
            bbox = box.xyxy[0].tolist()
            corners = [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]]
            ]

            # 绘制检测框（蓝色）
            cv2.rectangle(display_img, 
                         (int(bbox[0]), int(bbox[1])),
                         (int(bbox[2]), int(bbox[3])),
                         (0, 0, 255), 5)
            
            # print(corners)
            undistorted = cv2.undistort(frame, cam_matrix, dist_coeffs)
            # 自动检测9个点
            detected_points = gp.auto_detect_corners(undistorted, corners)
            if detected_points is not None:
                detected_points = detected_points.tolist()
                detected_points = [[x, y, index] for [x, y] in detected_points]
                ans_point+=detected_points

                # 绘制棋盘格点（绿色）
                for point in detected_points:
                    cv2.circle(display_img, 
                              (int(point[0]), int(point[1])),
                              10, (0, 0, 255), -1)
                    
        # 6. 显示检测结果（1秒）
        display_img = cv2.resize(display_img, (1200, 900))  # 调整显示图像大小
        cv2.imshow('Detection Result', display_img)
        if cv2.waitKey(1000) & 0xFF == 27:  # 等待1秒，ESC键可中断
            break
    
    if(ans_point is not None and len(ans_point) == 18):
        grouped = defaultdict(list)
        for point in ans_point:
            x, y, index = point
            grouped[index].append((x, y, point))  # 存储原始点引用
        
        # 3. 找到组内 x,y 同时最大的点
        max_point_1 = max(grouped[1], key=lambda p: (p[0], p[1]))
        
        # 4. 找到组内 x,y 同时最小的点
        min_point_1 = min(grouped[1], key=lambda p: (p[0], p[1]))
        
        # 5. 计算两点间距离
        distance_1 = math.sqrt((max_point_1[0] - min_point_1[0])**2 + 
                            (max_point_1[1] - min_point_1[1])**2)
        print(f"分组 {1}: 极值点距离 = {distance_1:.2f}")
        
        # 3. 找到组内 x,y 同时最大的点
        max_point_2 = max(grouped[2], key=lambda p: (p[0], p[1]))
        
        # 4. 找到组内 x,y 同时最小的点
        min_point_2 = min(grouped[2], key=lambda p: (p[0], p[1]))
        
        # 5. 计算两点间距离
        distance_2 = math.sqrt((max_point_2[0] - min_point_2[0])**2 + 
                            (max_point_2[1] - min_point_2[1])**2)
        print(f"分组 {2}: 极值点距离 = {distance_2:.2f}")
        if distance_1 > distance_2:
            ans_point = [point for point in ans_point if point[2] != 2]
        else:
            ans_point = [point for point in ans_point if point[2] != 1]
    if len(ans_point) >= 5:
        output_results += 1
    else:
        no_handle_list.append(img_name)
    if not os.path.exists(txt_path) or os.path.getsize(txt_path) == 0 or len(header) < 8:
        le.write_text_file(txt_path, initial_header, ans_point)
    print(output_results)
unprocessed_path = os.path.join(test_dataset_path, 'unprocessed_images.txt')
with open(unprocessed_path, 'w') as f:
    for img_name in no_handle_list:
        f.write(f"{img_name}\n")

print(f"检测完成! 结果已保存到 detection_results.json")
print(f"共处理了 {output_results} 张图片")