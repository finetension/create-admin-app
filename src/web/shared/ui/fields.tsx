import {
	Description,
	Input,
	Label,
	ListBox,
	Select,
	TextArea,
	TextField,
} from "./components";
import { ChevronDownIcon } from "./icons";

type BaseFieldProps = {
	label: string;
	description?: string;
	className?: string;
	required?: boolean;
	isDisabled?: boolean;
};

type TextInputFieldProps = BaseFieldProps & {
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	pattern?: string;
	type?: React.HTMLInputTypeAttribute;
	maxLength?: number;
};

export function TextInputField({
	label,
	description,
	className,
	required,
	isDisabled,
	onValueChange,
	...inputProps
}: TextInputFieldProps) {
	return (
		<TextField
			className={className}
			fullWidth
			isDisabled={isDisabled}
			isRequired={required}
		>
			<Label>{label}</Label>
			<Input
				{...inputProps}
				onChange={(event) => onValueChange(event.currentTarget.value)}
			/>
			{description && <Description>{description}</Description>}
		</TextField>
	);
}

type TextAreaFieldProps = BaseFieldProps & {
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	maxLength?: number;
};

export function TextAreaField({
	label,
	description,
	className,
	required,
	isDisabled,
	onValueChange,
	...textAreaProps
}: TextAreaFieldProps) {
	return (
		<TextField
			className={className}
			fullWidth
			isDisabled={isDisabled}
			isRequired={required}
		>
			<Label>{label}</Label>
			<TextArea
				{...textAreaProps}
				onChange={(event) => onValueChange(event.currentTarget.value)}
			/>
			{description && <Description>{description}</Description>}
		</TextField>
	);
}

export type SelectOption = { value: string; label: string };

type SelectFieldProps = BaseFieldProps & {
	value: string;
	onValueChange: (value: string) => void;
	options: SelectOption[];
};

export function SelectField({
	label,
	description,
	className,
	required,
	isDisabled,
	value,
	onValueChange,
	options,
}: SelectFieldProps) {
	return (
		<Select
			className={className}
			fullWidth
			isDisabled={isDisabled}
			isRequired={required}
			selectedKey={value}
			onSelectionChange={(key) => onValueChange(String(key))}
		>
			<Label>{label}</Label>
			<Select.Trigger>
				<Select.Value />
				<Select.Indicator>
					<ChevronDownIcon size={16} />
				</Select.Indicator>
			</Select.Trigger>
			<Select.Popover>
				<ListBox>
					{options.map((option) => (
						<ListBox.Item
							id={option.value}
							key={option.value}
							textValue={option.label}
						>
							{option.label}
						</ListBox.Item>
					))}
				</ListBox>
			</Select.Popover>
			{description && <Description>{description}</Description>}
		</Select>
	);
}
