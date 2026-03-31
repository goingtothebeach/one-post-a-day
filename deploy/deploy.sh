#!/bin/bash
# One Post A Day - H5部署脚本
# 使用方法: ./deploy.sh [production|staging]

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
PROJECT_NAME="one-post-a-day"
LOCAL_DIST_DIR="./dist"
REMOTE_USER="root"  # 修改为你的服务器用户名
REMOTE_HOST="your-server.com"  # 修改为你的服务器地址
REMOTE_DIR="/var/www/one-post-a-day"  # 修改为服务器目标目录

# 打印带颜色的消息
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_step() {
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 未安装，请先安装"
        exit 1
    fi
}

# Step 1: 环境检查
print_step "Step 1: 环境检查"
check_command "npx"
check_command "rsync"
print_success "环境检查通过"

# Step 2: 清理旧的构建文件
print_step "Step 2: 清理旧的构建文件"
if [ -d "$LOCAL_DIST_DIR" ]; then
    rm -rf $LOCAL_DIST_DIR
    print_success "已清理旧的dist目录"
fi

# Step 3: 构建生产版本
print_step "Step 3: 构建生产版本"
print_info "运行: npx expo export -p web"
npx expo export -p web

if [ ! -d "$LOCAL_DIST_DIR" ]; then
    print_error "构建失败，dist目录不存在"
    exit 1
fi

print_success "构建完成！"
du -sh $LOCAL_DIST_DIR

# Step 4: 检查dist目录内容
print_step "Step 4: 检查构建产物"
print_info "dist目录内容："
ls -lh $LOCAL_DIST_DIR | head -20
print_success "构建产物检查完成"

# Step 5: 部署到服务器
print_step "Step 5: 部署到服务器"
print_info "目标服务器: $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

read -p "是否继续部署到远程服务器？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "取消部署"
    exit 0
fi

# 创建远程目录（如果不存在）
print_info "创建远程目录..."
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

# 上传文件
print_info "上传文件到服务器..."
rsync -avz --progress --delete \
    --exclude='.DS_Store' \
    --exclude='*.map' \
    $LOCAL_DIST_DIR/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

print_success "文件上传完成"

# Step 6: 配置Nginx
print_step "Step 6: 配置Nginx"
print_info "上传Nginx配置文件..."

# 上传Nginx配置
scp deploy/nginx.conf $REMOTE_USER@$REMOTE_HOST:/tmp/one-post-a-day.nginx.conf

# 在服务器上执行配置
ssh $REMOTE_USER@$REMOTE_HOST << 'ENDSSH'
    echo "配置Nginx..."
    
    # 备份旧配置（如果存在）
    if [ -f /etc/nginx/sites-available/one-post-a-day ]; then
        sudo cp /etc/nginx/sites-available/one-post-a-day /etc/nginx/sites-available/one-post-a-day.bak.$(date +%Y%m%d_%H%M%S)
    fi
    
    # 复制新配置
    sudo mv /tmp/one-post-a-day.nginx.conf /etc/nginx/sites-available/one-post-a-day
    
    # 创建软链接
    sudo ln -sf /etc/nginx/sites-available/one-post-a-day /etc/nginx/sites-enabled/one-post-a-day
    
    # 测试Nginx配置
    echo "测试Nginx配置..."
    sudo nginx -t
    
    # 重载Nginx
    echo "重载Nginx..."
    sudo systemctl reload nginx
    
    echo "Nginx配置完成"
ENDSSH

print_success "Nginx配置完成"

# Step 7: 部署完成
print_step "🎉 部署成功！"
print_success "H5应用已部署到: https://$REMOTE_HOST"
print_info "请在浏览器中访问测试"

# 显示下一步操作
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 下一步操作："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. 测试网站是否可以访问"
echo "2. 检查API是否正常工作"
echo "3. 测试登录、发帖、抽签等功能"
echo "4. 在微信内打开测试（需要HTTPS）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
