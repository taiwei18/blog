# Better UI 审查记录

日期：2026-10-21。使用已安装的 `better-ui` skill。

范围：当前配置实际使用的首页、文章列表与分页、文章详情、目录、标签、搜索、关于、时间线、404，以及共享导航、页脚和主题切换。保留现有字体、色彩、密度与方角视觉风格。下表记录已修复项；结论只适用于此范围。

## 先保证交互成立

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH（已修复） | `src/pages/search.astro:109`, `src/pages/search.astro:133`, `src/pages/search.astro:230` | 清空后，未完成的搜索仍可能重新填入旧结果；按钮提示的 Esc 操作未实现 | 输入、清空和组件卸载均使旧请求失效；取消待执行搜索；按钮与 Esc 共用清空逻辑 | 交互正确性优先于视觉打磨，清空后的状态必须可靠 |

## 尊重减少动态效果偏好

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH（已修复） | `src/components/Motion.astro:22`, `src/components/PageTransition.astro:12`, `src/plugins/ScrollToTopPlugin.astro:30`, `src/pages/about.astro:351`, `src/style/main.css:845` | 部分脚本驱动的位移、模糊、计数、文字扰动和滚动缺少偏好分支 | 入场与退场在减少动态效果时只淡化；计数直接显示；停止文字扰动；返回顶部直接定位；取消装饰性指针吸附 | 动态效果必须遵循系统偏好，且内容仍应可见 |

## 悬停只用于支持悬停的指针

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH（已修复） | `src/style/main.css:45`, `src/style/main.css:117`, `src/style/main.css:141`, `src/style/main.css:239`, `src/style/main.css:547`, `src/style/main.css:577`, `src/style/main.css:608`, `src/style/main.css:703`, `src/style/main.css:715`, `src/style/main.css:748`, `src/components/layout/Header.astro:361`, `src/layouts/LandingLayout.astro:236` | 部分普通 CSS 悬停样式和导航指针处理没有设备能力限制 | CSS 使用 `hover: hover`；导航指针处理检查精细且可悬停的指针；保留键盘焦点反馈 | 避免触屏点击后残留悬停状态。Tailwind 4 原生 hover 变体已有媒体查询保护 |

## 高频状态即时反馈，只过渡明确属性

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM（已修复） | `src/style/main.css:109`, `src/style/main.css:125`, `src/style/main.css:304`, `src/style/main.css:477`, `src/style/main.css:654`, `src/style/main.css:824`, `src/components/ToC.astro:96`, `src/pages/search.astro:152`, `src/pages/about.astro:272` | 行悬停、箭头、导航标记、目录和标签切换包含位移、伸缩或较长颜色过渡 | 高频反馈使用即时颜色/边界，或不超过 150ms 的透明度/背景过渡；位置直接更新 | 高频操作不应不断触发装饰运动，静态状态仍清楚可辨 |
| MEDIUM（已修复） | `src/components/AdjacentPostsBar.astro:30`, `src/components/Pagination.astro:25`, `src/components/posts/PostsList.astro:51`, `src/components/posts/PostsListItem.astro:46`, `src/layouts/LandingLayout.astro:82`, `src/layouts/PostLayout.astro:91`, `src/pages/tags/[tag].astro:38`, `src/pages/tags/index.astro:51`, `src/pages/timeline.mdx:35`, `src/pages/404.astro:74`, `src/pages/about.astro:193` | 活跃页面使用 `transition-all`、悬停位移或持续颜色过渡 | 移除泛化过渡和箭头位移；保留颜色、边框、图标和背景提示 | 属性应明确，避免布局或样式变化意外被动画化 |
| MEDIUM（已修复） | `src/plugins/HeadingAnchorsPlugin.astro:43`, `src/style/main.css:177`, `src/plugins/ScrollToTopPlugin.astro:1` | 复制提示和返回顶部可见状态带有固定时间线的跳动/位移 | 复制成功使用静态勾选及文字提示；显示隐藏使用 150ms 透明度过渡；隐藏返回顶部控件设置 inert | 交互状态应能反向切换，隐藏控件不应继续接受操作 |

## 按压与上下文图标使用精确值

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM（已修复） | `src/style/main.css:99`, `src/style/main.css:542`, `src/components/layout/FooterItem.astro:5`, `src/components/mode/ModeToggle.astro:5`, `src/pages/search.astro:54`, `src/plugins/ScrollToTopPlugin.astro:8` | 按压幅度不一致，页脚按压曾缩至 0.85 | 统一为 0.96、150ms、ease-out；排除 disabled 与 data-static；页脚和主题组件提供 static 属性；减少动态效果时不缩放 | 提供克制一致的按压反馈和可退出机制 |
| MEDIUM（已修复） | `src/components/mode/ModeToggle.astro:35`, `src/components/mode/ModeToggle.astro:110` | 主题图标切换参数及颜色过渡抑制不完整 | 双图标以 0.25→1 缩放、4px→0 模糊和透明度交叉淡化，300ms、cubic-bezier(0.2,0,0,1)；减少动态效果时只淡化；换色期间抑制过渡并强制刷新样式 | 图标有稳定的上下文变化，换色时页面不产生杂乱渐变 |

## 低频入场与退场

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM（已修复） | `src/components/Motion.astro:22`, `src/components/PageTransition.astro:7`, `src/style/main.css:217` | 入场参数不统一，部分可见性依赖基础 opacity: 0 | 语义分组以 100ms 错峰，300ms、12px、4px 模糊、ease-out 入场；退场固定 -12px、4px、150ms；故障兜底隐藏状态放入 from 关键帧；偏好变化不重播已显示内容 | 层级有序且退场简短，脚本失败也不会永久隐藏内容 |

## 容器与表面细节

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM（已修复） | `src/style/main.css:639` | 短视口下菜单缺少独立滚动高度和滚动边界 | 使用视口相关最大高度、纵向自动滚动及 overscroll-behavior: contain | 横屏菜单内容可达，滚到底不会带动背景 |
| LOW（已修复） | `src/style/main.css:71`, `src/style/main.css:403` | 内容图边界带色；阴影环缺少强制颜色模式的结构后备 | 不透明内容图使用内缩 1px 的纯黑/白 10% 轮廓；导航阴影环保留透明 1px 边框 | 图像边缘不偏色，系统移除阴影后仍有边界 |

## 验证

- `pnpm check`：ESLint、Stylelint、Astro 检查通过；73 个文件，0 错误、0 警告、0 提示。
- `pnpm build`：25 个静态页面构建成功，Pagefind 索引 7 页。
- `pnpm test`：2 个测试文件、6 个测试通过。`git diff --check` 通过。
- 浏览器检查：首页、文章列表及第二页、文章详情、标签、搜索、关于、时间线和 404；桌面深色外观、键盘焦点、目录、复制提示、标签切换和主题切换。
- 搜索检查：命中、空结果、Esc 清空，以及延迟旧响应在清空后完成的竞态；旧结果未重新出现。
- 移动端检查：390×640 菜单、主题切换、Esc 关闭；568×320 横屏菜单滚到底时，菜单 scrollTop 为 165、页面 scrollY 保持 0。
- 减少动态效果检查：入场无位移/模糊；退场关键帧只包含透明度；切换偏好不重播已显示内容；长文章返回顶部后 scrollY 为 0，隐藏控件恢复 inert。

## Not verified

- 未在浏览器 Animations 面板以 10% 速度完整重放本轮所有动画；不以计算样式或截图替代该项验证。
- 未全面覆盖全部文章内容和所有图标状态；内容图轮廓及 forced-colors 后备仅完成代码检查，缺少对应视觉样本验证。
- 当前配置未使用的 Dropdown、HeaderItem、MobileNavToggle、FlipCard、GlassIcons、SplitText、ShinyTitle、Hero 和网格文章模式不在本次结论内；这些组件仍需单独审查。
- 未全面测量图标光学校准、笔画与文字字重，以及每个嵌套表面的半径关系。

已检查范围内无未解决 HIGH 项。

Approve
