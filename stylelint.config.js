/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-recommended', 'stylelint-config-html'],
  rules: {
    'at-rule-no-unknown': null,
    'at-rule-no-deprecated': null,
    // Astro 局部样式中的 :global(...) 合法
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['global'] }
    ],
    // Tailwind v4 的 @utility 块本身就是 & 的作用域
    'nesting-selector-no-missing-scoping-root': [
      true,
      { ignoreAtRules: ['utility'] }
    ]
  }
}
