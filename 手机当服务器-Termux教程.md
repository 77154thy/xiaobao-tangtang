# 手机当服务器（不用电脑玩）教程

> 目标：**没有电脑、电脑关机**，两台手机（安卓）也能玩。
> 原理：让其中一台安卓手机装一个终端 App（Termux），在手机里直接运行游戏服务器。
> 零成本、零注册，只需要在一台手机上做一次设置。

⚠️ 前提：作为"服务器"的那台手机需要是 **安卓**（iPhone 装不了 Termux）。
两台手机连**同一个 WiFi**，或者其中一台**开热点**给另一台连。

---

## 第一步：装 Termux（约 3 分钟，只需一次）

1. 手机浏览器打开 **https://f-droid.org/** ，先下载安装 **F-Droid** 商店（点页面上的 Download F-Droid）；
   （或者直接在应用商店搜"F-Droid"）
2. 在 F-Droid 里搜索 **Termux**，点安装；
3. 安装完成后打开 Termux，看到黑色终端界面即可。

> 也可以直接在浏览器下载 Termux 安装包：在 F-Droid 网页搜 Termux → 下载 APK → 允许"安装未知来源应用"后安装。

## 第二步：一行命令启动游戏（约 1 分钟，每次玩都执行这条）

在 Termux 里**长按屏幕 → Paste（粘贴）**下面这一整行，然后回车：

```sh
pkg install -y curl && curl -fsSL https://ghproxy.net/https://raw.githubusercontent.com/77154thy/xiaobao-tangtang/main/termux-start.sh | sh
```

> 如果上面那条网络不通，直接粘贴这条等效命令（不用脚本）：
>
> ```sh
> pkg install -y nodejs-lts git && git clone --depth=1 https://ghproxy.net/https://github.com/77154thy/xiaobao-tangtang.git ~/xiaobao-tangtang && cd ~/xiaobao-tangtang && npm install --no-audit --no-fund && node server/index.js
> ```

首次运行会自动安装环境 + 下载游戏（约 1~2 分钟）。成功后屏幕上会显示：

```
======================================================
  启动成功！保持 Termux 窗口开着就是开机状态

  这台手机自己玩:   http://localhost:3080
  另一台设备(连同一 WiFi/热点)打开:
      http://192.168.x.x:3080
======================================================
```

## 第三步：两台手机开玩

1. **另一台手机**连上同一个 WiFi（或连这台手机开的热点）；
2. 另一台手机浏览器打开上面显示的 `http://192.168.x.x:3080`；
3. 一台创建房间、报房间号，另一台加入 → 开玩！
4. 作为服务器的那台手机自己也能玩：浏览器打开 `http://localhost:3080`。

## 让它"一直在线"的小设置（推荐）

- 在 Termux 窗口里下拉通知栏 → 点 **Acquire wakelock**（保持运行）；
- 手机设置 → 应用 → Termux → 电池 → 选 **不受限制 / 允许后台运行**；
- 玩完想关掉：回到 Termux 按 **Ctrl+C**（音量键组合：音量下+字母 c），或直接划掉 Termux。

## 常见问题

**Q：一定要每次都用命令启动吗？**
A：可以做成 shortcut：Termux 里装 Termux:Widget 后把 `termux-start.sh` 放到 `~/.shortcuts/`，桌面就能一键启动（进阶，非必须）。

**Q：iPhone 可以当服务器吗？**
A：不行。iPhone 不能跑 Termux；用另一台安卓当服务器，iPhone 照常可以**玩**。

**Q：没有 WiFi，只有流量怎么办？**
A：开热点：服务器手机开"个人热点"，另一台连上热点后打开脚本显示的地址即可（热点下服务器手机的 IP 一般是 192.168.43.1 之类，脚本显示的为准）。

**Q：想要两台手机在不同地方也能玩？**
A：那必须有公网服务器：买一台便宜云服务器（腾讯云/阿里云轻量约 ¥50~100/年，微信/支付宝付款即可）即可 24 小时在线，或者等 GitHub 账号养熟后用免费方案（见 部署指南.md）。
