import tkinter as tk
from tkinter import filedialog


def select_file(title="选择文件", initial_dir=None, file_types=None):
    """
    打开文件选择对话框，允许用户选择文件并返回文件路径

    参数:
        title (str): 对话框标题
        initial_dir (str): 初始打开的目录路径
        file_types (list): 允许的文件类型列表，格式为[(描述, 扩展名), ...]

    返回:
        str: 用户选择的文件路径，如果取消选择则返回空字符串
    """
    # 创建一个隐藏的主窗口
    root = tk.Tk()
    root.withdraw()  # 隐藏窗口

    # 设置文件类型过滤器
    if file_types is None:
        file_types = [("所有文件", "*.*")]

    # 打开文件选择对话框
    file_path = filedialog.askopenfilename(
        title=title,
        initialdir=initial_dir,
        filetypes=file_types
    )

    return file_path


def select_directory(title="选择目录", initial_dir=None):
    """
    打开目录选择对话框，允许用户选择目录并返回目录路径

    参数:
        title (str): 对话框标题
        initial_dir (str): 初始打开的目录路径

    返回:
        str: 用户选择的目录路径，如果取消选择则返回空字符串
    """
    # 创建一个隐藏的主窗口
    root = tk.Tk()
    root.withdraw()  # 隐藏窗口

    # 打开目录选择对话框
    dir_path = filedialog.askdirectory(
        title=title,
        initialdir=initial_dir
    )

    return dir_path

