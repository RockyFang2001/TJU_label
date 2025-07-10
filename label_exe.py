import os
import base64
import io
import webbrowser
import re
import time
from flask import Flask, request, jsonify, send_from_directory
from PIL import Image
import exifread
import chardet
from itertools import islice
from path_select import select_directory
import threading
import sys
import random

# 全局配置
FOLDER_PATH = ""
if not os.path.exists(FOLDER_PATH):
    FOLDER_PATH = select_directory("请选择一个目录")

# Flask应用设置
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'static')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder, static_url_path='/static')
else:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    static_folder = os.path.join(current_dir, 'static')
    app = Flask(__name__, static_folder=static_folder, static_url_path='/static')

shutdown_event = threading.Event()

# 辅助函数

def convert_gps(coordinate, ref):
    """
    将度、分、秒转换为十进制坐标
    :param coordinate: GPS坐标值
    :param ref: 方向参考 ('N', 'S', 'E', 'W')
    :return: 十进制坐标
    """
    d = float(coordinate.values[0].num) / coordinate.values[0].den
    m = float(coordinate.values[1].num) / coordinate.values[1].den
    s = float(coordinate.values[2].num) / coordinate.values[2].den
    decimal = d + m / 60 + s / 3600
    return -decimal if ref in ['S', 'W'] else decimal

def extract_geo_info(image_path):
    """
    从图像中提取GPS和云台姿态信息
    :param image_path: 图像文件的完整路径
    :return: 包含纬度、经度、高度和云台翻滚、俯仰、偏航角度的字典
    """
    geo_data = {
        'Latitude': None, 'Longitude': None, 'Altitude': None,
        'GimbalRoll': None, 'GimbalPitch': None, 'GimbalYaw': None
    }
    try:
        with open(image_path, 'rb') as f:
            tags = exifread.process_file(f)
        data = bytearray()
        with open(image_path, 'rb') as img:
            flag = False
            xmp_description_start = b"\x3c\x72\x64\x66\x3a\x44\x65\x73\x63\x72\x69\x70\x74\x69\x6f\x6e\x20"
            xmp_description_end = b"\x3c\x2f\x72\x64\x66\x3a\x44\x65\x73\x63\x72\x69\x70\x74\x69\x6f\x6e\x3e"
            for line in img.readlines():
                if xmp_description_start in line:
                    flag = True
                if flag:
                    data += line
                if xmp_description_end in line:
                    break
            dj_data_dict = {}
            if data:
                try:
                    data_str = data.decode('ascii', errors='ignore')
                    lines = [d.strip()[10:] for d in data_str.split("\n") if 'drone-dji:' in d]
                    for d in lines:
                        if '=' in d:
                            k, v = d.split("=", 1)
                            dj_data_dict[k.strip()] = v.strip()
                except Exception:
                    print(f"Warning: 无法用ASCII解码 {image_path} 的DJI数据，跳过解析")
    except Exception as e:
        print(f"提取DJI元数据块时出错: {e}")

    if 'GPS GPSLatitude' in tags and 'GPS GPSLatitudeRef' in tags:
        try:
            geo_data['Latitude'] = convert_gps(tags['GPS GPSLatitude'], tags['GPS GPSLatitudeRef'].values)
        except Exception as e:
            print(f"解析 {image_path} 的纬度时出错: {e}")
    if 'GPS GPSLongitude' in tags and 'GPS GPSLongitudeRef' in tags:
        try:
            geo_data['Longitude'] = convert_gps(tags['GPS GPSLongitude'], tags['GPS GPSLongitudeRef'].values)
        except Exception as e:
            print(f"解析 {image_path} 的经度时出错: {e}")
    if 'GPS GPSAltitude' in tags:
        try:
            alt = tags['GPS GPSAltitude'].values[0]
            geo_data['Altitude'] = float(alt.num) / alt.den
        except Exception as e:
            print(f"解析 {image_path} 的高度时出错: {e}")

    euler_angle_tags_map = {
        'GimbalRoll': 'GimbalRollDegree',
        'GimbalPitch': 'GimbalPitchDegree',
        'GimbalYaw': 'GimbalYawDegree'
    }
    for key, tag_name in euler_angle_tags_map.items():
        if tag_name in dj_data_dict:
            value_str = dj_data_dict[tag_name]
            try:
                geo_data[key] = float(value_str)
            except ValueError:
                print(f"Warning: {image_path} 中 '{tag_name}' 的云台值 ('{value_str}') 不是简单的浮点数，存储为原始字符串")
                geo_data[key] = value_str
            except Exception as e:
                print(f"处理 {image_path} 的云台标签 {tag_name} 时出错: {e}")
    return geo_data

def read_text_file(txt_file_path):
    """
    读取文本文件，返回前8行和坐标列表
    :param txt_file_path: 文本文件的完整路径
    :return: (header_lines, coordinates_list)
    """
    header = []
    raw_coordinates = []
    try:
        with open(txt_file_path, 'rb') as raw_file:
            detector = chardet.detect(raw_file.read())
            encoding = detector['encoding'] if detector['encoding'] else 'utf-8'
        with open(txt_file_path, 'r', encoding=encoding, errors='replace') as f:
            lines = f.readlines()
            header = lines[:8]
            for line in islice(lines, 8, None):
                coord = parse_coordinate_line(line.strip())
                raw_coordinates.append(coord)
    except FileNotFoundError:
        print(f"Warning: 未找到文本文件: {txt_file_path}，返回空数据")
        return [], [None]
    except Exception as e:
        print(f"读取文本文件 {txt_file_path} 时出错: {e}")
        return [], [None]

    valid_coordinates = [coord for coord in raw_coordinates if coord is not None]
    coordinates = valid_coordinates if valid_coordinates else [None]
    print(f"Debug: 从 {txt_file_path} 读取。原始: {raw_coordinates}。处理后: {coordinates}")
    return header, coordinates

def write_text_file(txt_file_path, header, coordinates):
    """
    将头部信息和坐标列表写入文本文件
    :param txt_file_path: 文本文件的完整路径
    :param header: 包含前8行的字符串列表
    :param coordinates: (x, y) 或 (x, y, target_number) 元组或 None 的列表
    """
    try:
        with open(txt_file_path, 'w', encoding='utf-8') as f:
            for line in header:
                f.write(line)
            valid_coords_to_write = [coord for coord in coordinates if coord is not None]
            if not valid_coords_to_write:
                f.write("x none y none\n")
            else:
                for coord in valid_coords_to_write:
                    if len(coord) >= 3:
                        f.write(f"靶标 {int(coord[2])}: x {int(coord[0])} y {int(coord[1])}\n")
                    else:
                        f.write(f"x {int(coord[0])} y {int(coord[1])}\n")
        # print(f"Debug: 已将坐标保存到 {txt_file_path}。写入的数据: {valid_coords_to_write if valid_coords_to_write else '[None]'}")
    except Exception as e:
        print(f"写入文本文件 {txt_file_path} 时出错: {e}")

def parse_coordinate_line(line):
    """
    解析坐标字符串行，如 "x 123 y 456 target 1" 或 "x none y none"
    :return: (x, y, target_number) 元组，或如果行表示 '无注释' 或解析失败则返回 None
    """
    parts = line.strip().split()
    if len(parts) >= 4 and parts[2] == "x" and parts[4] == "y":
        x_val = parts[3].lower()
        y_val = parts[5].lower()
        if x_val == "none" and y_val == "none":
            return None
        try:
            x = int(x_val)
            y = int(y_val)
            target_number = None
            if len(parts) >= 6:
                try:
                    target_number = int(re.findall(r'\d+', parts[1])[0])
                except ValueError:
                    print(f"Warning: 坐标行中靶标号码格式无效: {line.strip()}")
            if target_number is not None:
                return (x, y, target_number)
            else:
                return (x, y)
        except ValueError:
            print(f"Warning: 坐标行中数字格式无效: {line.strip()}")
            return None
    return None

# Flask路由

@app.route('/')
def index():
    """根路由，提供HTML页面"""
    return send_from_directory('static', 'index.html')


@app.route('/api/process_rectangle', methods=['POST'])
def process_rectangle():
    data = request.get_json()
    rectangle = data.get('rectangle')
    if not rectangle:
        return jsonify({'error': 'Invalid rectangle data'}), 400

    # 提取矩形的角点
    corners = [
        [rectangle[0][0], rectangle[0][1], 1],
        [rectangle[1][0], rectangle[0][1], 2],
        [rectangle[1][0], rectangle[1][1], 3],
        [rectangle[0][0], rectangle[1][1], 4]
    ]

    # 打乱角点顺序
    random.shuffle(corners)

    return jsonify(corners)




@app.route('/api/images')
def get_image_list():
    """API路由，返回图像文件列表"""
    try:
        image_files = [f for f in os.listdir(FOLDER_PATH) if f.lower().endswith(('.jpeg', '.jpg', '.png'))]
        image_files.sort()
        if not image_files:
            print(f"Warning: 在 '{FOLDER_PATH}' 中未找到图像文件，请确保已放置图像")
        return jsonify(image_files)
    except FileNotFoundError:
        print(f"Error: 未找到图像文件夹 '{FOLDER_PATH}'，请创建并放置图像")
        return jsonify({'error': f"图像文件夹 '{FOLDER_PATH}' 未找到"}), 500
    except Exception as e:
        print(f"列出图像时出错: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/image/<int:index>')
def get_image_data(index):
    """
    API路由，按索引返回图像数据、元数据和注释坐标
    :param index: 图像列表中的索引
    """
    try:
        image_files = [f for f in os.listdir(FOLDER_PATH) if f.lower().endswith(('.jpeg', '.jpg', '.png'))]
        image_files.sort()
        if not (0 <= index < len(image_files)):
            return jsonify({'error': '图像索引超出范围'}), 404
        image_filename = image_files[index]
        image_path = os.path.join(FOLDER_PATH, image_filename)
        base_name = os.path.splitext(image_filename)[0]
        txt_path = os.path.join(FOLDER_PATH, f"{base_name}.txt")

        with Image.open(image_path) as img:
            original_width, original_height = img.size
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG')
            encoded_img = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

        current_geo_info = extract_geo_info(image_path)
        header, coordinates = read_text_file(txt_path)

        if not os.path.exists(txt_path) or os.path.getsize(txt_path) == 0 or len(header) < 8:
            initial_header = [
                f"Filename: {image_filename}\n",
                f"Latitude: {current_geo_info['Latitude'] if current_geo_info['Latitude'] is not None else 'N/A'}\n",
                f"Longitude: {current_geo_info['Longitude'] if current_geo_info['Longitude'] is not None else 'N/A'}\n",
                f"Altitude: {current_geo_info['Altitude'] if current_geo_info['Altitude'] is not None else 'N/A'} meters\n",
                "Gimbal Orientation:\n",
                f"  Roll:  {current_geo_info['GimbalRoll'] if current_geo_info['GimbalRoll'] is not None else 'N/A'}°\n",
                f"  Pitch: {current_geo_info['GimbalPitch'] if current_geo_info['GimbalPitch'] is not None else 'N/A'}°\n",
                f"  Yaw:   {current_geo_info['GimbalYaw'] if current_geo_info['GimbalYaw'] is not None else 'N/A'}°\n",
                "\n"
            ]
            write_text_file(txt_path, initial_header, coordinates)
            print(f"Debug: 为 {image_filename} 重新初始化TXT文件")

        header, coordinates = read_text_file(txt_path)
        return jsonify({
            'filename': image_filename,
            'image_data': encoded_img,
            'geo_info': current_geo_info,
            'header_lines': header,
            'coordinates': coordinates,
            'original_dimensions': {'width': original_width, 'height': original_height}
        })
    except Exception as e:
        print(f"/api/image/{index} 出错: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/save_coordinates/<int:index>', methods=['POST'])
def save_coordinates_data(index):
    """
    API路由，接收并保存指定图像的注释坐标
    :param index: 图像列表中的索引
    """
    try:
        image_files = [f for f in os.listdir(FOLDER_PATH) if f.lower().endswith(('.jpeg', '.jpg', '.png'))]
        image_files.sort()
        if not (0 <= index < len(image_files)):
            return jsonify({'error': '图像索引超出范围'}), 404
        image_filename = image_files[index]
        base_name = os.path.splitext(image_filename)[0]
        txt_path = os.path.join(FOLDER_PATH, f"{base_name}.txt")
        data = request.json
        header = data.get('header_lines', [])
        coordinates = data.get('coordinates', [])
        if len(header) < 8:
            header.extend(['\n'] * (8 - len(header)))
        header = header[:8]
        write_text_file(txt_path, header, coordinates)
        return jsonify({'message': '坐标保存成功!'})
    except Exception as e:
        print(f"保存索引 {index} 的坐标时出错: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """关闭服务器的路由"""
    shutdown_event.set()
    return jsonify({"status": "success", "message": "服务器正在关闭"})

if __name__ == '__main__':
    def open_browser():
        """延迟打开浏览器的函数"""
        time.sleep(1.5)
        webbrowser.open('http://localhost:5000')
        print("已自动打开浏览器访问: http://localhost:5000")

    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        threading.Thread(target=open_browser, daemon=True).start()

    print("正在启动Flask服务器...")
    print("服务器将在 http://localhost:5000 运行")

    server_thread = threading.Thread(target=app.run, kwargs={'host': 'localhost', 'port': 5000})
    server_thread.daemon = True
    server_thread.start()
    shutdown_event.wait()
    print("收到退出信号，服务器正在关闭...")
    sys.exit(0)