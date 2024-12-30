class AnalyticsUtil {

    static trackEvent(type, category, label) {
        gtag('event', type, {
            'event_category': category,
            'event_label': label
        });
    }

}