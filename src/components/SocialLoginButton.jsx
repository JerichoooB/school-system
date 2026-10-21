function SocialLoginButton({ icon, text, onClick }) {
    return (
        <button
            type="button"
            className="social-login-button"
            onClick={onClick}
        >
            <span className="social-icon">
                {icon}
            </span>

            <span>
                {text}
            </span>
        </button>
    );
}

export default SocialLoginButton;