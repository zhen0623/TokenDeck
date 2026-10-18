# WebView JS 接口：必须保留方法名，否则 JS 调不到
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# NativeBridge 被 JS 按名调用，整个类保留（防止类名/方法名被混淆）
-keep class com.darius.tokendeck.NativeBridge { *; }

# Activity 由系统反射创建
-keep class com.darius.tokendeck.MainActivity { *; }
