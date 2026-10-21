import { Mail, Lock } from "lucide-react";

function InputField({
    type,
    name,
    placeholder,
    icon,
    value,
    onChange
}) {
    return (
        <div className="input-wrapper">

            <span className="input-icon">

                {icon === "email" ? (
                    <Mail size={18} />
                ) : (
                    <Lock size={18} />
                )}

            </span>

            <input
                type={type}
                name={name}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                required
            />

        </div>
    );
}

export default InputField;