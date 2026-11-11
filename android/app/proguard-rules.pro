-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.smalltalkapps.** { *; }
-dontwarn android.webkit.**
