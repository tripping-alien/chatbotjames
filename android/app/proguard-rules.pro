-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class net.smalltalkapps.** { *; }
-dontwarn android.webkit.**
